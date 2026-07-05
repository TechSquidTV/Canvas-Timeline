import { listDirectoryEntries, removeEntryIfExists } from '@/persistence/opfs/files';
import { isNotFoundError } from '@/persistence/opfs/support';
import {
  ASSETS_DIRECTORY,
  getMediaLibraryRoot,
  readMediaLibraryManifest,
  readSourceOriginal,
  readSourcePoster,
  writeMediaLibraryManifest,
} from './media-library-files';
import { createFailedManifestSource, toManifestSource } from './media-library-runtime';
import type { MediaLibrarySource } from './media-library-types';

export async function loadMediaLibrarySources() {
  const root = await getMediaLibraryRoot();
  const manifest = await readMediaLibraryManifest(root);
  const loadedSources: MediaLibrarySource[] = [];
  let repaired = false;

  for (const source of manifest.sources) {
    const file = await readSourceOriginal(root, source.originalPath);
    const posterFile = await readSourcePoster(root, source.posterPath);
    const readySourceMissingOriginal =
      source.status === 'ready' && (source.originalPath === null || file === null);
    const manifestSource = readySourceMissingOriginal
      ? createFailedManifestSource({
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
    await writeMediaLibraryManifest(root, {
      version: 1,
      sources: loadedSources.map(toManifestSource),
    });
  }

  return loadedSources;
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
