import type { MediabunnySource } from '@techsquidtv/canvas-timeline-mediabunny-adapter';
import type {
  MediaLibraryManifestSource,
  MediaLibraryMediaKind,
  MediaLibrarySource,
} from '#full-editor/features/media/library/media-library-types';

export function createPlayableSources(
  sources: readonly MediaLibrarySource[]
): readonly MediabunnySource[] {
  return sources
    .filter(
      (source): source is MediaLibrarySource & { file: File } =>
        source.status === 'ready' && source.file !== null && source.kind !== 'image'
    )
    .map((source) => ({
      sourceId: source.id,
      input: { kind: 'blob', blob: source.file },
    }));
}

export function createFailedManifestSource(options: {
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

export function toManifestSource(source: MediaLibrarySource): MediaLibraryManifestSource {
  const { file: _file, posterFile: _posterFile, ...manifest } = source;
  return manifest;
}
