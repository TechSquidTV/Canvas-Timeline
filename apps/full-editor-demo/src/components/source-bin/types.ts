import type { MediabunnySource } from '@techsquidtv/canvas-timeline-mediabunny-adapter';
import type { MediaLibrarySource } from '@/media/library/media-library-types';

export interface SourceBinSource extends MediaLibrarySource {
  thumbnailUrl: string | null;
}

export interface SourceBinContextValue {
  activeDragSourceId: string | null;
  clearSourceActionMessage: (sourceId: string) => void;
  endSourceDrag: (sourceId: string) => void;
  importFiles: (files: FileList | readonly File[]) => Promise<void>;
  importing: boolean;
  removeSource: (sourceId: string) => Promise<void>;
  selectSource: (sourceId: string) => void;
  sourceActionMessage: SourceBinActionMessage | null;
  selectedSourceId: string | null;
  setSourceActionMessage: (message: SourceBinActionMessage) => void;
  sources: readonly SourceBinSource[];
  startSourceDrag: (sourceId: string) => void;
  storageAvailable: boolean;
}

export interface SourceBinMediaContextValue {
  toMediabunnySources: () => readonly MediabunnySource[];
}

export interface SourceBinActionMessage {
  message: string;
  sourceId: string;
}
