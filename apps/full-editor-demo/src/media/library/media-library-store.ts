import { importSourceFile } from './media-library-import';
import { loadMediaLibrarySources } from './media-library-repair';
import { createPlayableSources } from './media-library-runtime';
import { removeStoredSource } from './media-library-files';
import type {
  MediaLibraryImportResult,
  MediaLibrarySource,
  MediaLibraryStore,
} from './media-library-types';

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
