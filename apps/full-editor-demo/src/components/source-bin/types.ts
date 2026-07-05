import type { MediabunnySource } from '@techsquidtv/canvas-timeline-mediabunny-adapter';
import type { MediaLibrarySource } from '@/media/library/media-library-types';

export interface SourceBinSource extends MediaLibrarySource {
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
