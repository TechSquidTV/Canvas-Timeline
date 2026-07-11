import { useMediabunnyTimelineMedia } from '@techsquidtv/canvas-timeline-mediabunny-adapter/react';
import type { MediabunnySource } from '@techsquidtv/canvas-timeline-mediabunny-adapter';
import { useCallback, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useSourceBinMedia } from '#full-editor/features/source-bin/source-bin-context';
import {
  EditorMediaSyncContext,
  type EditorMediaSyncContextValue,
  type PreviewLayerName,
} from '#full-editor/features/media/media-sync-context';
import { useEditorProject } from '#full-editor/features/project/project-context';
import { getProjectFrameRatePreset } from '#full-editor/features/project/frame-rate';

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
  const { metadata } = useEditorProject();
  const { timecodeFrameRate } = getProjectFrameRatePreset(metadata.frameRate);
  const { durationBySourceId, pause, play, playing, ready, status } =
    useMediabunnyTimelineMedia<PreviewLayerName>({
      canvasRef,
      frameRate: timecodeFrameRate,
      sources,
      layers: previewLayerSelectors,
      onError: setPlaybackError,
    });

  const clearPlaybackError = useCallback(() => {
    setPlaybackError(null);
  }, []);

  const togglePlay = useCallback(async () => {
    if (playing) {
      pause();
      clearPlaybackError();
      return;
    }

    const result = await play();
    setPlaybackError(result.ok ? null : result.message);
  }, [clearPlaybackError, pause, play, playing]);

  const value = useMemo<EditorMediaSyncContextValue>(
    () => ({
      canvasRef,
      clearPlaybackError,
      durationBySourceId,
      hasMediaSources: true,
      pause,
      play,
      playbackError,
      playing,
      ready,
      status,
      togglePlay,
    }),
    [
      canvasRef,
      clearPlaybackError,
      durationBySourceId,
      pause,
      play,
      playing,
      playbackError,
      ready,
      status,
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
      canvasRef,
      clearPlaybackError,
      durationBySourceId: new Map(),
      hasMediaSources: false,
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
