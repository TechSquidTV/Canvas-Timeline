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
import {
  hasOpfsSupport,
  loadStoredSources,
  removeStoredSource,
  type StoredSourceBinSource,
} from './source-bin-storage';
import { importSourceFile, type SourceBinImportResult } from './source-bin-import';
import { SourceBinContext } from './source-bin-context';
import type { SourceBinSource } from './types';

export function SourceBinProvider({ children }: { children: ReactNode }) {
  const [sources, setSources] = useState<readonly SourceBinSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [storageAvailable] = useState(hasOpfsSupport);
  const thumbnailUrlsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!storageAvailable) {
      return;
    }

    let cancelled = false;

    void loadStoredSources()
      .then((storedSources) => {
        if (cancelled) {
          return;
        }

        setSources(storedSources.map((source) => createRuntimeSource(source, thumbnailUrlsRef)));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSources([createRestoreFailureSource(error)]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [storageAvailable]);

  useEffect(
    () => () => {
      for (const url of thumbnailUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      thumbnailUrlsRef.current.clear();
    },
    []
  );

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
        for (const file of fileList) {
          const source = createRuntimeSourceFromImport(
            await importSourceFile(file),
            thumbnailUrlsRef
          );
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
      if (existingSource?.thumbnailUrl !== null && existingSource?.thumbnailUrl !== undefined) {
        URL.revokeObjectURL(existingSource.thumbnailUrl);
        thumbnailUrlsRef.current.delete(existingSource.thumbnailUrl);
      }

      if (storageAvailable) {
        await removeStoredSource(sourceId);
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
  storedSource: StoredSourceBinSource,
  thumbnailUrlsRef: MutableRefObject<Set<string>>
): SourceBinSource {
  const thumbnailUrl =
    storedSource.thumbnailFile === null ? null : URL.createObjectURL(storedSource.thumbnailFile);

  if (thumbnailUrl !== null) {
    thumbnailUrlsRef.current.add(thumbnailUrl);
  }

  return {
    ...storedSource.manifest,
    file: storedSource.file,
    thumbnailUrl,
  };
}

function createRuntimeSourceFromImport(
  importedSource: SourceBinImportResult,
  thumbnailUrlsRef: MutableRefObject<Set<string>>
): SourceBinSource {
  const thumbnailUrl =
    importedSource.thumbnail === null ? null : URL.createObjectURL(importedSource.thumbnail);

  if (thumbnailUrl !== null) {
    thumbnailUrlsRef.current.add(thumbnailUrl);
  }

  return {
    ...importedSource.source,
    thumbnailUrl,
  };
}

function createRestoreFailureSource(error: unknown): SourceBinSource {
  return {
    id: `failed-${crypto.randomUUID()}`,
    kind: 'unsupported',
    mimeType: '',
    name: 'Source Bin restore failed',
    originalPath: null,
    sizeBytes: 0,
    status: 'failed',
    metadata: {},
    errorMessage: error instanceof Error ? error.message : String(error),
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
