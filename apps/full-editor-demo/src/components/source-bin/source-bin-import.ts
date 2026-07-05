import { getSupportedSourceKind, probeSourceFile } from './source-bin-media';
import {
  persistSourceOriginal,
  persistSourceThumbnail,
  updateSourceManifest,
} from './source-bin-storage';
import type { SourceBinManifestSource, SourceBinMediaKind, SourceBinSource } from './types';

export interface SourceBinImportResult {
  source: SourceBinSource;
  thumbnail: Blob | null;
}

export async function importSourceFile(file: File): Promise<SourceBinImportResult> {
  const sourceId = `source-${crypto.randomUUID()}`;
  const expectedKind = getSupportedSourceKind(file);

  if (expectedKind === null) {
    return appendManifestOrVisibleFailure(
      createFailedManifest({
        errorMessage: 'Unsupported source type.',
        file,
        kind: 'unsupported',
        originalPath: null,
        sourceId,
      }),
      file
    );
  }

  let originalPath: string;
  try {
    originalPath = await persistSourceOriginal(sourceId, file);
  } catch (error) {
    return appendManifestOrVisibleFailure(
      createFailedManifest({
        errorMessage: `Storage failed: ${errorMessage(error)}`,
        file,
        kind: expectedKind,
        originalPath: null,
        sourceId,
      }),
      file
    );
  }

  try {
    const probe = await probeSourceFile(file, expectedKind);
    const thumbnailPath = await persistSourceThumbnail(sourceId, probe.thumbnail);
    const manifest: SourceBinManifestSource = {
      id: sourceId,
      kind: probe.kind,
      mimeType: file.type,
      name: file.name,
      originalPath,
      sizeBytes: file.size,
      status: 'ready',
      metadata: probe.metadata,
      thumbnailPath,
    };

    await updateSourceManifest((sources) => [...sources, manifest]);

    return {
      source: {
        ...manifest,
        file,
        thumbnailUrl: null,
      },
      thumbnail: probe.thumbnail,
    };
  } catch (error) {
    return appendManifestOrVisibleFailure(
      createFailedManifest({
        errorMessage: errorMessage(error),
        file,
        kind: expectedKind,
        originalPath,
        sourceId,
      }),
      file
    );
  }
}

async function appendManifestOrVisibleFailure(
  manifest: SourceBinManifestSource,
  file: File
): Promise<SourceBinImportResult> {
  try {
    await updateSourceManifest((sources) => [...sources, manifest]);
    return {
      source: {
        ...manifest,
        file,
        thumbnailUrl: null,
      },
      thumbnail: null,
    };
  } catch (error) {
    const visibleFailure = createFailedManifest({
      errorMessage: `Manifest update failed: ${errorMessage(error)}`,
      file,
      kind: manifest.kind,
      originalPath: manifest.originalPath,
      sourceId: manifest.id,
    });

    return {
      source: {
        ...visibleFailure,
        file,
        thumbnailUrl: null,
      },
      thumbnail: null,
    };
  }
}

function createFailedManifest(options: {
  errorMessage: string;
  file: File;
  kind: SourceBinMediaKind;
  originalPath: string | null;
  sourceId: string;
}): SourceBinManifestSource {
  return {
    id: options.sourceId,
    kind: options.kind,
    mimeType: options.file.type,
    name: options.file.name,
    originalPath: options.originalPath,
    sizeBytes: options.file.size,
    status: 'failed',
    metadata: {},
    errorMessage: options.errorMessage,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
