import type { MediabunnySource } from '@techsquidtv/canvas-timeline-mediabunny-adapter';
import { getSupportedSourceKind, probeSourceFile } from '@/media/ingest/source-media';
import {
  getAppStorageRoot,
  getDirectoryFromPath,
  listDirectoryEntries,
  readFileFromPath,
  removeEntryIfExists,
  writeBlobToPath,
} from '@/persistence/opfs/files';
import { createMutationQueue } from '@/persistence/opfs/mutation-queue';
import { errorMessage, isNotFoundError } from '@/persistence/opfs/support';
import {
  createEmptyMediaLibraryManifest,
  parseMediaLibraryManifest,
  type MediaLibraryManifestFile,
} from './media-library-manifest';
import type {
  MediaLibraryImportResult,
  MediaLibraryManifestSource,
  MediaLibraryMediaKind,
  MediaLibrarySource,
  MediaLibraryStore,
} from './media-library-types';

const MEDIA_LIBRARY_DIRECTORY = 'media-library';
const ASSETS_DIRECTORY = 'assets';
const MANIFEST_FILE = 'manifest.json';
const ORIGINAL_FILE = 'original';
const POSTER_FILE = 'poster.webp';

const mediaLibraryQueue = createMutationQueue();

function createMediaLibraryStore(): MediaLibraryStore {
  let sources: readonly MediaLibrarySource[] = [];

  const load = async () => {
    sources = await loadMediaLibrarySources();
    return sources;
  };

  return {
    getPlayableSources: () => createPlayableSources(sources),
    importFiles: async (files) => {
      const importedSources: MediaLibraryImportResult[] = [];

      for (const file of Array.from(files)) {
        const importedSource = await importSourceFile(file);
        importedSources.push(importedSource);
        sources = upsertSource(sources, importedSource.source);
      }

      return importedSources;
    },
    load,
    removeSource: async (sourceId) => {
      await removeStoredSource(sourceId);
      sources = sources.filter((source) => source.id !== sourceId);
      return sources;
    },
    repair: load,
  };
}

export const mediaLibraryStore = createMediaLibraryStore();

async function loadMediaLibrarySources() {
  const root = await getMediaLibraryRoot();
  const manifest = await readManifest(root);
  const loadedSources: MediaLibrarySource[] = [];
  let repaired = false;

  for (const source of manifest.sources) {
    const file =
      source.originalPath === null ? null : await readFileFromPath(root, source.originalPath);
    const posterFile =
      source.posterPath === undefined ? null : await readFileFromPath(root, source.posterPath);
    const readySourceMissingOriginal =
      source.status === 'ready' && (source.originalPath === null || file === null);
    const manifestSource = readySourceMissingOriginal
      ? createFailedManifest({
          errorMessage: 'Stored original file is missing.',
          fileName: source.name,
          kind: source.kind,
          mimeType: source.mimeType,
          originalPath: null,
          sizeBytes: source.sizeBytes,
          sourceId: source.id,
        })
      : source;

    repaired = repaired || readySourceMissingOriginal;
    loadedSources.push({
      ...manifestSource,
      file: readySourceMissingOriginal ? null : file,
      posterFile,
    });
  }

  await removeOrphanedAssetDirectories(root, loadedSources);

  if (repaired) {
    await writeManifest(root, {
      version: 1,
      sources: loadedSources.map(toManifestSource),
    });
  }

  return loadedSources;
}

async function importSourceFile(file: File): Promise<MediaLibraryImportResult> {
  const sourceId = `source-${crypto.randomUUID()}`;
  const expectedKind = getSupportedSourceKind(file);

  if (expectedKind === null) {
    return appendManifestOrVisibleFailure(
      createFailedManifest({
        errorMessage: 'Unsupported source type.',
        fileName: file.name,
        kind: 'unsupported',
        mimeType: file.type,
        originalPath: null,
        sizeBytes: file.size,
        sourceId,
      })
    );
  }

  let originalPath: string;
  try {
    originalPath = await persistSourceOriginal(sourceId, file);
  } catch (error) {
    return appendManifestOrVisibleFailure(
      createFailedManifest({
        errorMessage: `Storage failed: ${errorMessage(error)}`,
        fileName: file.name,
        kind: expectedKind,
        mimeType: file.type,
        originalPath: null,
        sizeBytes: file.size,
        sourceId,
      })
    );
  }

  try {
    const probe = await probeSourceFile(file, expectedKind);
    const posterPath = await persistSourcePoster(sourceId, probe.poster);
    const manifest: MediaLibraryManifestSource = {
      id: sourceId,
      kind: probe.kind,
      mimeType: file.type,
      name: file.name,
      originalPath,
      posterPath,
      sizeBytes: file.size,
      status: 'ready',
      metadata: probe.metadata,
    };

    await updateSourceManifest((mediaEntries) => [...mediaEntries, manifest]);

    return {
      source: {
        ...manifest,
        file,
        posterFile: null,
      },
      poster: probe.poster,
    };
  } catch (error) {
    return appendManifestOrVisibleFailure(
      createFailedManifest({
        errorMessage: errorMessage(error),
        fileName: file.name,
        kind: expectedKind,
        mimeType: file.type,
        originalPath,
        sizeBytes: file.size,
        sourceId,
      })
    );
  }
}

async function appendManifestOrVisibleFailure(
  manifest: MediaLibraryManifestSource
): Promise<MediaLibraryImportResult> {
  try {
    await updateSourceManifest((sources) => [...sources, manifest]);
    return {
      source: {
        ...manifest,
        file: null,
        posterFile: null,
      },
      poster: null,
    };
  } catch (error) {
    const visibleFailure = createFailedManifest({
      errorMessage: `Manifest update failed: ${errorMessage(error)}`,
      fileName: manifest.name,
      kind: manifest.kind,
      mimeType: manifest.mimeType,
      originalPath: manifest.originalPath,
      sizeBytes: manifest.sizeBytes,
      sourceId: manifest.id,
    });

    return {
      source: {
        ...visibleFailure,
        file: null,
        posterFile: null,
      },
      poster: null,
    };
  }
}

async function persistSourceOriginal(sourceId: string, file: File): Promise<string> {
  const root = await getMediaLibraryRoot();
  const path = getOriginalPath(sourceId);
  await writeBlobToPath(root, path, file);
  return path;
}

async function persistSourcePoster(
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

async function removeStoredSource(sourceId: string) {
  await mediaLibraryQueue.run(async () => {
    const root = await getMediaLibraryRoot();
    const assets = await root.getDirectoryHandle(ASSETS_DIRECTORY, { create: true });

    await removeEntryIfExists(assets, sourceId, { recursive: true });
    await updateSourceManifestWithoutQueue(root, (sources) =>
      sources.filter((source) => source.id !== sourceId)
    );
  });
}

async function updateSourceManifest(
  updater: (sources: readonly MediaLibraryManifestSource[]) => readonly MediaLibraryManifestSource[]
) {
  await mediaLibraryQueue.run(async () => {
    const root = await getMediaLibraryRoot();
    await updateSourceManifestWithoutQueue(root, updater);
  });
}

async function updateSourceManifestWithoutQueue(
  root: FileSystemDirectoryHandle,
  updater: (sources: readonly MediaLibraryManifestSource[]) => readonly MediaLibraryManifestSource[]
) {
  const manifest = await readManifest(root);
  await writeManifest(root, {
    version: 1,
    sources: [...updater(manifest.sources)],
  });
}

async function readManifest(root: FileSystemDirectoryHandle): Promise<MediaLibraryManifestFile> {
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

async function writeManifest(root: FileSystemDirectoryHandle, manifest: MediaLibraryManifestFile) {
  await writeBlobToPath(
    root,
    MANIFEST_FILE,
    new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
  );
}

async function removeOrphanedAssetDirectories(
  root: FileSystemDirectoryHandle,
  sources: readonly MediaLibrarySource[]
) {
  let assets: FileSystemDirectoryHandle;
  try {
    assets = await root.getDirectoryHandle(ASSETS_DIRECTORY);
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }

    throw error;
  }

  const sourceIds = new Set(sources.map((source) => source.id));
  const entries = await listDirectoryEntries(assets);

  for (const entry of entries) {
    if (entry.kind === 'directory' && !sourceIds.has(entry.name)) {
      await removeEntryIfExists(assets, entry.name, { recursive: true });
    }
  }
}

async function getMediaLibraryRoot() {
  const root = await getAppStorageRoot();
  return getDirectoryFromPath(root, [MEDIA_LIBRARY_DIRECTORY], true);
}

function createPlayableSources(
  sources: readonly MediaLibrarySource[]
): readonly MediabunnySource[] {
  return sources
    .filter(
      (source): source is MediaLibrarySource & { file: File } =>
        source.status === 'ready' && source.file !== null && source.kind !== 'image'
    )
    .map((source) => ({
      id: source.id,
      blob: source.file,
    }));
}

function createFailedManifest(options: {
  errorMessage: string;
  fileName: string;
  kind: MediaLibraryMediaKind;
  mimeType: string;
  originalPath: string | null;
  sizeBytes: number;
  sourceId: string;
}): MediaLibraryManifestSource {
  return {
    id: options.sourceId,
    kind: options.kind,
    mimeType: options.mimeType,
    name: options.fileName,
    originalPath: options.originalPath,
    sizeBytes: options.sizeBytes,
    status: 'failed',
    metadata: {},
    errorMessage: options.errorMessage,
  };
}

function toManifestSource(source: MediaLibrarySource): MediaLibraryManifestSource {
  const { file: _file, posterFile: _posterFile, ...manifest } = source;
  return manifest;
}

function upsertSource(
  sources: readonly MediaLibrarySource[],
  nextSource: MediaLibrarySource
): readonly MediaLibrarySource[] {
  const existingIndex = sources.findIndex((source) => source.id === nextSource.id);
  if (existingIndex === -1) {
    return [...sources, nextSource];
  }

  return sources.map((source) => (source.id === nextSource.id ? nextSource : source));
}

function getOriginalPath(sourceId: string) {
  return `${ASSETS_DIRECTORY}/${sourceId}/${ORIGINAL_FILE}`;
}

function getPosterPath(sourceId: string) {
  return `${ASSETS_DIRECTORY}/${sourceId}/${POSTER_FILE}`;
}
