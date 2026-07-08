import {
  getAppStorageRoot,
  getDirectoryFromPath,
  readFileFromPath,
  removeEntryIfExists,
  writeBlobToPath,
} from '#full-editor/persistence/opfs/files';
import { createMutationQueue } from '#full-editor/persistence/opfs/mutation-queue';
import { isNotFoundError } from '#full-editor/persistence/opfs/support';
import {
  createEmptyMediaLibraryManifest,
  parseMediaLibraryManifest,
  type MediaLibraryManifestFile,
} from '#full-editor/media/library/media-library-manifest';
import type { MediaLibraryManifestSource } from '#full-editor/media/library/media-library-types';

export const ASSETS_DIRECTORY = 'assets';

const MEDIA_LIBRARY_DIRECTORY = 'media-library';
const MANIFEST_FILE = 'manifest.json';
const ORIGINAL_FILE = 'original';
const POSTER_FILE = 'poster.webp';

const mediaLibraryQueue = createMutationQueue();

export async function getMediaLibraryRoot() {
  const root = await getAppStorageRoot();
  return getDirectoryFromPath(root, [MEDIA_LIBRARY_DIRECTORY], true);
}

export async function readMediaLibraryManifest(
  root: FileSystemDirectoryHandle
): Promise<MediaLibraryManifestFile> {
  try {
    const fileHandle = await root.getFileHandle(MANIFEST_FILE);
    const file = await fileHandle.getFile();
    return parseMediaLibraryManifest(await file.text());
  } catch (error) {
    if (isNotFoundError(error)) {
      return createEmptyMediaLibraryManifest();
    }

    throw error;
  }
}

export async function writeMediaLibraryManifest(
  root: FileSystemDirectoryHandle,
  manifest: MediaLibraryManifestFile
) {
  await writeBlobToPath(
    root,
    MANIFEST_FILE,
    new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
  );
}

export async function updateMediaLibraryManifest(
  updater: (sources: readonly MediaLibraryManifestSource[]) => readonly MediaLibraryManifestSource[]
) {
  await mediaLibraryQueue.run(async () => {
    const root = await getMediaLibraryRoot();
    await updateMediaLibraryManifestWithoutQueue(root, updater);
  });
}

export async function removeStoredSource(sourceId: string) {
  await mediaLibraryQueue.run(async () => {
    const root = await getMediaLibraryRoot();
    const assets = await root.getDirectoryHandle(ASSETS_DIRECTORY, { create: true });

    await removeEntryIfExists(assets, sourceId, { recursive: true });
    await updateMediaLibraryManifestWithoutQueue(root, (sources) =>
      sources.filter((source) => source.id !== sourceId)
    );
  });
}

export async function clearStoredMediaLibrary() {
  await mediaLibraryQueue.run(async () => {
    const root = await getMediaLibraryRoot();
    await removeEntryIfExists(root, ASSETS_DIRECTORY, { recursive: true });
    await removeEntryIfExists(root, MANIFEST_FILE);
  });
}

async function updateMediaLibraryManifestWithoutQueue(
  root: FileSystemDirectoryHandle,
  updater: (sources: readonly MediaLibraryManifestSource[]) => readonly MediaLibraryManifestSource[]
) {
  const manifest = await readMediaLibraryManifest(root);
  await writeMediaLibraryManifest(root, {
    version: 1,
    sources: [...updater(manifest.sources)],
  });
}

export async function readSourceOriginal(
  root: FileSystemDirectoryHandle,
  path: string | null
): Promise<File | null> {
  return path === null ? null : readFileFromPath(root, path);
}

export async function readSourcePoster(
  root: FileSystemDirectoryHandle,
  path: string | undefined
): Promise<File | null> {
  const file = path === undefined ? null : await readFileFromPath(root, path);
  return file === null ? null : ensureFileType(file, 'image/webp');
}

export async function persistSourceOriginal(sourceId: string, file: File): Promise<string> {
  const root = await getMediaLibraryRoot();
  const path = getOriginalPath(sourceId);
  await writeBlobToPath(root, path, file);
  return path;
}

export async function persistSourcePoster(
  sourceId: string,
  poster: Blob | null
): Promise<string | undefined> {
  if (poster === null) {
    return undefined;
  }

  const root = await getMediaLibraryRoot();
  const path = getPosterPath(sourceId);
  await writeBlobToPath(root, path, poster);
  return path;
}

function getOriginalPath(sourceId: string) {
  return `${ASSETS_DIRECTORY}/${sourceId}/${ORIGINAL_FILE}`;
}

function getPosterPath(sourceId: string) {
  return `${ASSETS_DIRECTORY}/${sourceId}/${POSTER_FILE}`;
}

function ensureFileType(file: File, mimeType: string) {
  if (file.type === mimeType) {
    return file;
  }

  return new File([file], file.name, {
    lastModified: file.lastModified,
    type: mimeType,
  });
}
