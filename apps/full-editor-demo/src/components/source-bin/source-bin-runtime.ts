import type { MutableRefObject } from 'react';
import type {
  MediaLibraryImportResult,
  MediaLibrarySource,
} from '@/media/library/media-library-types';
import type { SourceBinSource } from './types';

export function createRuntimeSource(
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

export function createRuntimeSourceFromImport(
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

export function createInitialSources(
  initialSources: readonly MediaLibrarySource[],
  restoreError: string | undefined,
  thumbnailUrlsRef: MutableRefObject<Set<string>>
) {
  const sources = initialSources.map((source) => createRuntimeSource(source, thumbnailUrlsRef));
  return restoreError === undefined
    ? sources
    : [...sources, createRestoreFailureSource(restoreError)];
}

export function upsertSource(
  sources: readonly SourceBinSource[],
  nextSource: SourceBinSource
): readonly SourceBinSource[] {
  const existingIndex = sources.findIndex((source) => source.id === nextSource.id);
  if (existingIndex === -1) {
    return [...sources, nextSource];
  }

  return sources.map((source) => (source.id === nextSource.id ? nextSource : source));
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
