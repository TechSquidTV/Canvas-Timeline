import type { SourceBinManifestSource } from './types';

interface SourceBinManifestFile {
  version: 1;
  sources: SourceBinManifestSource[];
}

export interface StoredSourceBinSource {
  file: File | null;
  manifest: SourceBinManifestSource;
  thumbnailFile: File | null;
}

const SOURCE_BIN_DIRECTORY = 'source-bin';
const ASSETS_DIRECTORY = 'assets';
const MANIFEST_FILE = 'manifest.json';
const ORIGINAL_FILE = 'original';
const THUMBNAIL_FILE = 'thumbnail.webp';

export function hasOpfsSupport() {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
}

export async function loadStoredSources(): Promise<readonly StoredSourceBinSource[]> {
  const root = await getSourceBinRoot();
  const manifest = await readManifest(root);

  return Promise.all(
    manifest.sources.map(async (source) => ({
      manifest: source,
      file: source.originalPath === null ? null : await readFileFromPath(root, source.originalPath),
      thumbnailFile:
        source.thumbnailPath === undefined
          ? null
          : await readFileFromPath(root, source.thumbnailPath),
    }))
  );
}

export async function persistSourceOriginal(sourceId: string, file: File): Promise<string> {
  const root = await getSourceBinRoot();
  const directory = await getSourceDirectory(root, sourceId, true);
  const fileHandle = await directory.getFileHandle(ORIGINAL_FILE, { create: true });
  await writeBlob(fileHandle, file);
  return getOriginalPath(sourceId);
}

export async function persistSourceThumbnail(
  sourceId: string,
  thumbnail: Blob | null
): Promise<string | undefined> {
  if (thumbnail === null) {
    return undefined;
  }

  const root = await getSourceBinRoot();
  const directory = await getSourceDirectory(root, sourceId, true);
  const fileHandle = await directory.getFileHandle(THUMBNAIL_FILE, { create: true });
  await writeBlob(fileHandle, thumbnail);
  return getThumbnailPath(sourceId);
}

export async function updateSourceManifest(
  updater: (sources: readonly SourceBinManifestSource[]) => readonly SourceBinManifestSource[]
) {
  const root = await getSourceBinRoot();
  const manifest = await readManifest(root);
  await writeManifest(root, {
    version: 1,
    sources: [...updater(manifest.sources)],
  });
}

export async function removeStoredSource(sourceId: string) {
  const root = await getSourceBinRoot();
  const assets = await root.getDirectoryHandle(ASSETS_DIRECTORY, { create: true });

  await updateSourceManifest((sources) => sources.filter((source) => source.id !== sourceId));

  try {
    await assets.removeEntry(sourceId, { recursive: true });
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }
}

async function getSourceBinRoot() {
  const opfsRoot = await navigator.storage.getDirectory();
  return opfsRoot.getDirectoryHandle(SOURCE_BIN_DIRECTORY, { create: true });
}

async function getSourceDirectory(
  root: FileSystemDirectoryHandle,
  sourceId: string,
  create: boolean
) {
  const assets = await root.getDirectoryHandle(ASSETS_DIRECTORY, { create });
  return assets.getDirectoryHandle(sourceId, { create });
}

async function readManifest(root: FileSystemDirectoryHandle): Promise<SourceBinManifestFile> {
  try {
    const fileHandle = await root.getFileHandle(MANIFEST_FILE);
    const file = await fileHandle.getFile();
    const parsed = JSON.parse(await file.text()) as Partial<SourceBinManifestFile>;

    if (parsed.version !== 1 || !Array.isArray(parsed.sources)) {
      return createEmptyManifest();
    }

    return {
      version: 1,
      sources: parsed.sources.filter(isManifestSource),
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return createEmptyManifest();
    }

    throw error;
  }
}

async function writeManifest(root: FileSystemDirectoryHandle, manifest: SourceBinManifestFile) {
  const fileHandle = await root.getFileHandle(MANIFEST_FILE, { create: true });
  await writeBlob(
    fileHandle,
    new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
  );
}

async function readFileFromPath(
  root: FileSystemDirectoryHandle,
  path: string
): Promise<File | null> {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  let directory = root;
  for (const segment of segments.slice(0, -1)) {
    try {
      directory = await directory.getDirectoryHandle(segment);
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  try {
    const fileHandle = await directory.getFileHandle(segments[segments.length - 1] ?? '');
    return fileHandle.getFile();
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

async function writeBlob(fileHandle: FileSystemFileHandle, blob: Blob) {
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function createEmptyManifest(): SourceBinManifestFile {
  return { version: 1, sources: [] };
}

function getOriginalPath(sourceId: string) {
  return `${ASSETS_DIRECTORY}/${sourceId}/${ORIGINAL_FILE}`;
}

function getThumbnailPath(sourceId: string) {
  return `${ASSETS_DIRECTORY}/${sourceId}/${THUMBNAIL_FILE}`;
}

function isNotFoundError(error: unknown) {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

function isManifestSource(value: SourceBinManifestSource): value is SourceBinManifestSource {
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.mimeType === 'string' &&
    typeof value.sizeBytes === 'number' &&
    (value.kind === 'audio' ||
      value.kind === 'image' ||
      value.kind === 'unsupported' ||
      value.kind === 'video') &&
    (value.status === 'failed' || value.status === 'importing' || value.status === 'ready') &&
    (value.originalPath === null || typeof value.originalPath === 'string') &&
    typeof value.metadata === 'object' &&
    value.metadata !== null
  );
}
