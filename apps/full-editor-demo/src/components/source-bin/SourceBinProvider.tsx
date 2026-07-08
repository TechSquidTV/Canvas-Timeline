import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPlayableSources } from '#full-editor/media/library/media-library-runtime';
import { mediaLibraryStore } from '#full-editor/media/library/media-library-store';
import type { MediaLibrarySource } from '#full-editor/media/library/media-library-types';
import {
  SourceBinContext,
  SourceBinMediaContext,
} from '#full-editor/components/source-bin/source-bin-context';
import {
  createInitialSources,
  createRuntimeSourceFromImport,
  upsertSource,
} from '#full-editor/components/source-bin/source-bin-runtime';
import type {
  SourceBinActionMessage,
  SourceBinSource,
} from '#full-editor/components/source-bin/types';

interface SourceBinProviderProps {
  children: ReactNode;
  initialSources: readonly MediaLibrarySource[];
  restoreError?: string;
  storageAvailable: boolean;
}

export function SourceBinProvider({
  children,
  initialSources,
  restoreError,
  storageAvailable,
}: SourceBinProviderProps) {
  const thumbnailUrlsRef = useRef(new Set<string>());
  const [sources, setSources] = useState<readonly SourceBinSource[]>(() =>
    createInitialSources(initialSources, restoreError, thumbnailUrlsRef)
  );
  const [sourceActionMessage, setSourceActionMessage] = useState<SourceBinActionMessage | null>(
    null
  );
  const [activeDragSourceId, setActiveDragSourceId] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const thumbnailUrls = thumbnailUrlsRef.current;

    return () => {
      for (const url of thumbnailUrls) {
        URL.revokeObjectURL(url);
      }
      thumbnailUrls.clear();
    };
  }, []);

  const importFiles = useCallback(
    async (files: FileList | readonly File[]) => {
      if (!storageAvailable) {
        return;
      }

      const fileList = Array.from(files);
      if (fileList.length === 0) {
        return;
      }

      setImporting(true);
      try {
        const importedSources = await mediaLibraryStore.importFiles(fileList);

        for (const importedSource of importedSources) {
          const source = createRuntimeSourceFromImport(importedSource, thumbnailUrlsRef);
          setSources((currentSources) => upsertSource(currentSources, source));
          if (source.status !== 'failed') {
            setSelectedSourceId(source.id);
          }
        }
      } finally {
        setImporting(false);
      }
    },
    [storageAvailable]
  );

  const removeSource = useCallback(
    async (sourceId: string) => {
      const existingSource = sources.find((source) => source.id === sourceId);

      if (storageAvailable) {
        await mediaLibraryStore.removeSource(sourceId);
      }

      if (existingSource?.thumbnailUrl !== null && existingSource?.thumbnailUrl !== undefined) {
        URL.revokeObjectURL(existingSource.thumbnailUrl);
        thumbnailUrlsRef.current.delete(existingSource.thumbnailUrl);
      }

      setSources((currentSources) => currentSources.filter((source) => source.id !== sourceId));
      setActiveDragSourceId((currentSourceId) =>
        currentSourceId === sourceId ? null : currentSourceId
      );
      setSelectedSourceId((currentSourceId) =>
        currentSourceId === sourceId ? null : currentSourceId
      );
      setSourceActionMessage((currentMessage) =>
        currentMessage?.sourceId === sourceId ? null : currentMessage
      );
    },
    [sources, storageAvailable]
  );

  const clearSourceActionMessage = useCallback((sourceId: string) => {
    setSourceActionMessage((currentMessage) =>
      currentMessage?.sourceId === sourceId ? null : currentMessage
    );
  }, []);

  const endSourceDrag = useCallback((sourceId: string) => {
    setActiveDragSourceId((currentSourceId) =>
      currentSourceId === sourceId ? null : currentSourceId
    );
  }, []);

  const toMediabunnySources = useCallback(() => createPlayableSources(sources), [sources]);
  const mediaValue = useMemo(
    () => ({
      toMediabunnySources,
    }),
    [toMediabunnySources]
  );

  const value = useMemo(
    () => ({
      activeDragSourceId,
      clearSourceActionMessage,
      endSourceDrag,
      importFiles,
      importing,
      removeSource,
      selectSource: setSelectedSourceId,
      sourceActionMessage,
      selectedSourceId,
      setSourceActionMessage,
      sources,
      startSourceDrag: setActiveDragSourceId,
      storageAvailable,
    }),
    [
      activeDragSourceId,
      clearSourceActionMessage,
      endSourceDrag,
      importFiles,
      importing,
      removeSource,
      selectedSourceId,
      setSourceActionMessage,
      sourceActionMessage,
      sources,
      storageAvailable,
    ]
  );

  return (
    <SourceBinMediaContext.Provider value={mediaValue}>
      <SourceBinContext.Provider value={value}>{children}</SourceBinContext.Provider>
    </SourceBinMediaContext.Provider>
  );
}
