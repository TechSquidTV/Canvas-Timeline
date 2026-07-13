import type { UseMediabunnyTimelineMediaResult } from '@techsquidtv/canvas-timeline-mediabunny-adapter/react';
import { createContext, useContext, type RefObject } from 'react';

export type PreviewLayerName = 'audio' | 'visuals';
type MediaSyncState = UseMediabunnyTimelineMediaResult<PreviewLayerName>;

export interface EditorMediaSyncContextValue extends Pick<
  MediaSyncState,
  'pause' | 'play' | 'playing' | 'ready' | 'status'
> {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  clearPlaybackError: () => void;
  hasMediaSources: boolean;
  playbackError: string | null;
  togglePlay: () => Promise<void>;
}

export const EditorMediaSyncContext = createContext<EditorMediaSyncContextValue | null>(null);

export function useEditorMediaSync() {
  const context = useContext(EditorMediaSyncContext);

  if (context === null) {
    throw new Error('useEditorMediaSync must be used inside MediaSyncProvider');
  }

  return context;
}
