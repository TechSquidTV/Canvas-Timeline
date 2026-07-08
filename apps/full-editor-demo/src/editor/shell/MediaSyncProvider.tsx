import { useMediabunnyTimelineMedia } from '@techsquidtv/canvas-timeline-mediabunny-adapter/react';
import type { MediabunnySource } from '@techsquidtv/canvas-timeline-mediabunny-adapter';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { useCallback, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useSourceBinMedia } from '#full-editor/components/source-bin/source-bin-context';
import {
  EditorMediaSyncContext,
  type EditorMediaSyncContextValue,
  type PreviewLayerName,
} from '#full-editor/editor/shell/media-sync-context';

const previewLayerSelectors = {
  visuals: { trackKind: 'visual' },
  audio: { trackKind: 'audio' },
} as const;

export function MediaSyncProvider({ children }: { children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toMediabunnySources } = useSourceBinMedia();
  const sources = useMemo(() => toMediabunnySources(), [toMediabunnySources]);

  if (sources.length === 0) {
    return <IdleMediaSyncProvider canvasRef={canvasRef}>{children}</IdleMediaSyncProvider>;
  }

  return (
    <ActiveMediaSyncProvider canvasRef={canvasRef} sources={sources}>
      {children}
    </ActiveMediaSyncProvider>
  );
}

function ActiveMediaSyncProvider({
  canvasRef,
  children,
  sources,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  children: ReactNode;
  sources: readonly MediabunnySource[];
}) {
  const [playbackError, setPlaybackError] = useState<string | null>(null);
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
      hasMediaSources: true,
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
      canvasRef,
      clearPlaybackError,
      media.activeLayers,
      media.durationBySourceId,
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

function IdleMediaSyncProvider({
  canvasRef,
  children,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  children: ReactNode;
}) {
  const clearPlaybackError = useCallback(() => {}, []);
  const pause = useCallback(
    () => ({ ok: false, reason: 'disabled' as const, message: 'No media loaded.' }),
    []
  );
  const play = useCallback(
    () =>
      Promise.resolve({
        ok: false as const,
        reason: 'not-ready' as const,
        message: 'No media loaded.',
      }),
    []
  );
  const togglePlay = useCallback(() => play().then(() => undefined), [play]);
  const value = useMemo<EditorMediaSyncContextValue>(
    () => ({
      activeLayers: {
        all: [],
        byTrack: new Map(),
        hasActiveClips: false,
        layers: {
          audio: [],
          visuals: [],
        },
        primary: {},
        time: fromSeconds(0),
      },
      canvasRef,
      clearPlaybackError,
      durationBySourceId: new Map(),
      hasMediaSources: false,
      lastFrameTime: null,
      pause,
      play,
      playbackError: null,
      playing: false,
      ready: false,
      status: 'No media',
      togglePlay,
    }),
    [canvasRef, clearPlaybackError, pause, play, togglePlay]
  );

  return (
    <EditorMediaSyncContext.Provider value={value}>{children}</EditorMediaSyncContext.Provider>
  );
}
