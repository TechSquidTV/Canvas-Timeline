import type {
  MediaLibraryManifestSource,
  MediaLibraryMediaKind,
  MediaLibraryMediaMetadata,
  MediaLibraryStatus,
} from '#full-editor/media/library/media-library-types';

export interface MediaLibraryManifestFile {
  version: 1;
  sources: MediaLibraryManifestSource[];
}

interface JsonObject {
  readonly [key: string]: unknown;
}

export function parseMediaLibraryManifest(text: string): MediaLibraryManifestFile {
  const parsed: unknown = JSON.parse(text);

  if (!isJsonObject(parsed) || parsed.version !== 1 || !Array.isArray(parsed.sources)) {
    return createEmptyMediaLibraryManifest();
  }

  return {
    version: 1,
    sources: parsed.sources.filter(isManifestSource),
  };
}

export function createEmptyMediaLibraryManifest(): MediaLibraryManifestFile {
  return { version: 1, sources: [] };
}

function isManifestSource(value: unknown): value is MediaLibraryManifestSource {
  if (!isJsonObject(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.mimeType === 'string' &&
    typeof value.sizeBytes === 'number' &&
    isSourceKind(value.kind) &&
    isSourceStatus(value.status) &&
    (value.originalPath === null || typeof value.originalPath === 'string') &&
    (value.posterPath === undefined || typeof value.posterPath === 'string') &&
    (value.errorMessage === undefined || typeof value.errorMessage === 'string') &&
    isSourceMetadata(value.metadata)
  );
}

function isSourceKind(value: unknown): value is MediaLibraryMediaKind {
  return value === 'audio' || value === 'image' || value === 'unsupported' || value === 'video';
}

function isSourceStatus(value: unknown): value is MediaLibraryStatus {
  return value === 'failed' || value === 'importing' || value === 'ready';
}

function isSourceMetadata(value: unknown): value is MediaLibraryMediaMetadata {
  if (!isJsonObject(value)) {
    return false;
  }

  return (
    isOptionalNumber(value.averageFrameRate) &&
    isOptionalNumber(value.durationSeconds) &&
    isOptionalNumber(value.height) &&
    isOptionalNumber(value.width) &&
    isOptionalBoolean(value.hasAudio) &&
    isOptionalBoolean(value.hasVideo)
  );
}

function isOptionalNumber(value: unknown) {
  return value === undefined || typeof value === 'number';
}

function isOptionalBoolean(value: unknown) {
  return value === undefined || typeof value === 'boolean';
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
