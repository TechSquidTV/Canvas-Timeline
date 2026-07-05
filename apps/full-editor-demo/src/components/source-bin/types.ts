import type { MediabunnySource } from '@techsquidtv/canvas-timeline-mediabunny-adapter';

export type SourceBinImportableKind = 'audio' | 'image' | 'video';
export type SourceBinMediaKind = SourceBinImportableKind | 'unsupported';
export type SourceBinStatus = 'failed' | 'importing' | 'ready';

export interface SourceBinMediaMetadata {
  durationSeconds?: number;
  height?: number;
  width?: number;
  hasAudio?: boolean;
  hasVideo?: boolean;
}

export interface SourceBinManifestSource {
  id: string;
  kind: SourceBinMediaKind;
  mimeType: string;
  name: string;
  originalPath: string | null;
  sizeBytes: number;
  status: SourceBinStatus;
  metadata: SourceBinMediaMetadata;
  thumbnailPath?: string;
  errorMessage?: string;
}

export interface SourceBinSource extends SourceBinManifestSource {
  file: File | null;
  thumbnailUrl: string | null;
}

export interface SourceBinContextValue {
  importFiles: (files: FileList | readonly File[]) => Promise<void>;
  importing: boolean;
  removeSource: (sourceId: string) => Promise<void>;
  selectSource: (sourceId: string) => void;
  selectedSourceId: string | null;
  sources: readonly SourceBinSource[];
  storageAvailable: boolean;
  toMediabunnySources: () => readonly MediabunnySource[];
}

export interface SourceBinProbeResult {
  kind: SourceBinImportableKind;
  metadata: SourceBinMediaMetadata;
  thumbnail: Blob | null;
}
