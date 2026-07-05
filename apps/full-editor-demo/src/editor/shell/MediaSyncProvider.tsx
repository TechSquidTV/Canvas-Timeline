import { useMediabunnyTimelineMedia } from '@techsquidtv/canvas-timeline-mediabunny-adapter/react';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSourceBin } from '@/components/source-bin/source-bin-context';
import {
  EditorMediaSyncContext,
  type EditorMediaSyncContextValue,
  type PreviewLayerName,
} from './media-sync-context';

const previewLayerSelectors = {
  visuals: { trackKind: 'visual' },
  audio: { trackKind: 'audio' },
} as const;

export function MediaSyncProvider({ children }: { children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const { toMediabunnySources } = useSourceBin();
  const sources = useMemo(() => toMediabunnySources(), [toMediabunnySources]);
  const hasMediaSources = sources.length > 0;

  const media = useMediabunnyTimelineMedia<PreviewLayerName>({
    canvasRef,
    sources,
    layers: previewLayerSelectors,
    onError: setPlaybackError,
  });

  const clearPlaybackError = useCallback(() => {
    setPlaybackError(null);
  }, []);

  const togglePlay = useCallback(async () => {
    if (media.playing) {
      media.pause();
      clearPlaybackError();
      return;
    }

    const result = await media.play();
    setPlaybackError(result.ok ? null : result.message);
  }, [clearPlaybackError, media]);

  const value = useMemo<EditorMediaSyncContextValue>(
    () => ({
      activeLayers: media.activeLayers,
      canvasRef,
      clearPlaybackError,
      durationBySourceId: media.durationBySourceId,
      hasMediaSources,
      lastFrameTime: media.lastFrameTime,
      pause: media.pause,
      play: media.play,
      playbackError,
      playing: media.playing,
      ready: media.ready,
      status: media.status,
      togglePlay,
    }),
    [
      clearPlaybackError,
      media.activeLayers,
      media.durationBySourceId,
      hasMediaSources,
      media.lastFrameTime,
      media.pause,
      media.play,
      media.playing,
      media.ready,
      media.status,
      playbackError,
      togglePlay,
    ]
  );

  return (
    <EditorMediaSyncContext.Provider value={value}>{children}</EditorMediaSyncContext.Provider>
  );
}
