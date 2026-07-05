import type { MediabunnySource } from '@techsquidtv/canvas-timeline-mediabunny-adapter';

export type MediaLibraryImportableKind = 'audio' | 'image' | 'video';
export type MediaLibraryMediaKind = MediaLibraryImportableKind | 'unsupported';
export type MediaLibraryStatus = 'failed' | 'importing' | 'ready';

export interface MediaLibraryMediaMetadata {
  averageFrameRate?: number;
  durationSeconds?: number;
  height?: number;
  width?: number;
  hasAudio?: boolean;
  hasVideo?: boolean;
}

export interface MediaLibraryManifestSource {
  id: string;
  kind: MediaLibraryMediaKind;
  mimeType: string;
  name: string;
  originalPath: string | null;
  posterPath?: string;
  sizeBytes: number;
  status: MediaLibraryStatus;
  metadata: MediaLibraryMediaMetadata;
  errorMessage?: string;
}

export interface MediaLibrarySource extends MediaLibraryManifestSource {
  file: File | null;
  posterFile: File | null;
}

export interface MediaLibraryImportResult {
  source: MediaLibrarySource;
  poster: Blob | null;
}

export interface MediaLibraryProbeResult {
  kind: MediaLibraryImportableKind;
  metadata: MediaLibraryMediaMetadata;
  poster: Blob | null;
}

export interface MediaLibraryStore {
  getPlayableSources: () => readonly MediabunnySource[];
  importFiles: (files: FileList | readonly File[]) => Promise<readonly MediaLibraryImportResult[]>;
  load: () => Promise<readonly MediaLibrarySource[]>;
  removeSource: (sourceId: string) => Promise<readonly MediaLibrarySource[]>;
  repair: () => Promise<readonly MediaLibrarySource[]>;
}
