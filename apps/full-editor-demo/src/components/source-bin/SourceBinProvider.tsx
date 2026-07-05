import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import type { MediabunnySource } from '@techsquidtv/canvas-timeline-mediabunny-adapter';
import { mediaLibraryStore } from '@/media/library/media-library-store';
import type {
  MediaLibraryImportResult,
  MediaLibrarySource,
} from '@/media/library/media-library-types';
import { SourceBinContext } from './source-bin-context';
import type { SourceBinSource } from './types';

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
      setSelectedSourceId((currentSourceId) =>
        currentSourceId === sourceId ? null : currentSourceId
      );
    },
    [sources, storageAvailable]
  );

  const toMediabunnySources = useCallback(
    (): readonly MediabunnySource[] =>
      sources
        .filter(
          (source): source is SourceBinSource & { file: File } =>
            source.status === 'ready' && source.file !== null && source.kind !== 'image'
        )
        .map((source) => ({
          id: source.id,
          blob: source.file,
        })),
    [sources]
  );

  const value = useMemo(
    () => ({
      importFiles,
      importing,
      removeSource,
      selectSource: setSelectedSourceId,
      selectedSourceId,
      sources,
      storageAvailable,
      toMediabunnySources,
    }),
    [
      importFiles,
      importing,
      removeSource,
      selectedSourceId,
      sources,
      storageAvailable,
      toMediabunnySources,
    ]
  );

  return <SourceBinContext.Provider value={value}>{children}</SourceBinContext.Provider>;
}

function createRuntimeSource(
  storedSource: MediaLibrarySource,
  thumbnailUrlsRef: MutableRefObject<Set<string>>
): SourceBinSource {
  const thumbnailUrl =
    storedSource.posterFile === null ? null : URL.createObjectURL(storedSource.posterFile);

  if (thumbnailUrl !== null) {
    thumbnailUrlsRef.current.add(thumbnailUrl);
  }

  return {
    ...storedSource,
    thumbnailUrl,
  };
}

function createRuntimeSourceFromImport(
  importedSource: MediaLibraryImportResult,
  thumbnailUrlsRef: MutableRefObject<Set<string>>
): SourceBinSource {
  const thumbnailUrl =
    importedSource.poster === null ? null : URL.createObjectURL(importedSource.poster);

  if (thumbnailUrl !== null) {
    thumbnailUrlsRef.current.add(thumbnailUrl);
  }

  return {
    ...importedSource.source,
    thumbnailUrl,
  };
}

function createInitialSources(
  initialSources: readonly MediaLibrarySource[],
  restoreError: string | undefined,
  thumbnailUrlsRef: MutableRefObject<Set<string>>
) {
  const sources = initialSources.map((source) => createRuntimeSource(source, thumbnailUrlsRef));
  return restoreError === undefined
    ? sources
    : [...sources, createRestoreFailureSource(restoreError)];
}

function createRestoreFailureSource(errorMessage: string): SourceBinSource {
  return {
    id: `failed-${crypto.randomUUID()}`,
    kind: 'unsupported',
    mimeType: '',
    name: 'Source Bin restore failed',
    originalPath: null,
    posterFile: null,
    sizeBytes: 0,
    status: 'failed',
    metadata: {},
    errorMessage,
    file: null,
    thumbnailUrl: null,
  };
}

function upsertSource(
  sources: readonly SourceBinSource[],
  nextSource: SourceBinSource
): readonly SourceBinSource[] {
  const existingIndex = sources.findIndex((source) => source.id === nextSource.id);
  if (existingIndex === -1) {
    return [...sources, nextSource];
  }

  return sources.map((source) => (source.id === nextSource.id ? nextSource : source));
}
