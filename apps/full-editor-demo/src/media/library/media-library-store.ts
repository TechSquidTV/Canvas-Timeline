import { importSourceFile } from '#full-editor/media/library/media-library-import';
import { loadMediaLibrarySources } from '#full-editor/media/library/media-library-repair';
import { createPlayableSources } from '#full-editor/media/library/media-library-runtime';
import {
  clearStoredMediaLibrary,
  removeStoredSource,
} from '#full-editor/media/library/media-library-files';
import type {
  MediaLibraryImportResult,
  MediaLibrarySource,
  MediaLibraryStore,
} from '#full-editor/media/library/media-library-types';

function createMediaLibraryStore(): MediaLibraryStore {
  let sources: readonly MediaLibrarySource[] = [];

  const load = async () => {
    sources = await loadMediaLibrarySources();
    return sources;
  };

  return {
    clear: async () => {
      await clearStoredMediaLibrary();
      sources = [];
      return sources;
    },
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
