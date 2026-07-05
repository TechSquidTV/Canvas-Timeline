import { getSupportedSourceKind, probeSourceFile } from '@/media/ingest/source-media';
import { errorMessage } from '@/persistence/opfs/support';
import {
  persistSourceOriginal,
  persistSourcePoster,
  updateMediaLibraryManifest,
} from './media-library-files';
import { createFailedManifestSource } from './media-library-runtime';
import type { MediaLibraryImportResult, MediaLibraryManifestSource } from './media-library-types';

export async function importSourceFile(file: File): Promise<MediaLibraryImportResult> {
  const sourceId = `source-${crypto.randomUUID()}`;
  const expectedKind = getSupportedSourceKind(file);

  if (expectedKind === null) {
    return appendManifestOrVisibleFailure(
      createFailedManifestSource({
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
      createFailedManifestSource({
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

    await updateMediaLibraryManifest((mediaEntries) => [...mediaEntries, manifest]);

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
      createFailedManifestSource({
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
    await updateMediaLibraryManifest((sources) => [...sources, manifest]);
    return {
      source: {
        ...manifest,
        file: null,
        posterFile: null,
      },
      poster: null,
    };
  } catch (error) {
    const visibleFailure = createFailedManifestSource({
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
