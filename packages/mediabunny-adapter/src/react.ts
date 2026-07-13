import { useEffect, useReducer, useState, useSyncExternalStore, type RefObject } from 'react';
import {
  useTimelineMediaSync,
  type UseTimelineMediaSyncOptions,
  type UseTimelineMediaSyncResult,
} from '@techsquidtv/canvas-timeline-react';
import {
  createMediabunnyAdapter,
  type CreateMediabunnyAdapterOptions,
  type MediabunnyAdapter,
  type MediabunnyModule,
} from '#mediabunny-adapter/index';

/**
 * Options for creating a Mediabunny adapter from React.
 *
 * @remarks
 *
 * This lower-level options shape is useful when an app wants the underlying
 * {@link MediabunnyAdapter} for custom preview controls. The higher-level
 * {@link useMediabunnyTimelineMedia} hook adds timeline transport commands on
 * top of this adapter.
 */
export interface UseMediabunnyAdapterOptions extends Omit<
  CreateMediabunnyAdapterOptions,
  'canvas' | 'onChange'
> {
  /** Canvas ref that receives decoded visual frames. */
  canvasRef?: RefObject<HTMLCanvasElement | null>;
}

/**
 * Options for wiring Mediabunny decoded preview directly to timeline playback.
 *
 * @remarks
 *
 * Provide timeline sources, a canvas ref for visual frames, and named active
 * layer selectors. The hook creates a {@link MediabunnyAdapter}, uses
 * {@link useTimelineMediaSync} for external-clock playback, and keeps decoded
 * frames and audio scheduling aligned with the timeline playhead.
 *
 * @template LayerName - Named media layer keys inferred from `layers`, such as
 * `"visuals" | "audio"`.
 *
 * @see {@link https://canvastimeline.com/demos/media-preview-sync | Mediabunny media sync demo}
 */
export interface UseMediabunnyTimelineMediaOptions<LayerName extends string = string>
  extends
    Omit<UseMediabunnyAdapterOptions, 'mediabunny'>,
    Pick<
      UseTimelineMediaSyncOptions<LayerName>,
      'frameRate' | 'layers' | 'onError' | 'playbackOptions'
    > {
  /** Mediabunny module instance or lazy browser loader. Defaults to a browser import. */
  mediabunny?: CreateMediabunnyAdapterOptions['mediabunny'];
}

/**
 * Timeline transport state plus Mediabunny preview status and adapter details.
 *
 * @template LayerName - Named media layer keys from
 * {@link UseMediabunnyTimelineMediaOptions.layers}.
 */
export interface UseMediabunnyTimelineMediaResult<
  LayerName extends string = string,
> extends UseTimelineMediaSyncResult<LayerName> {
  /** Whether at least one Mediabunny source is loaded and ready for playback. */
  ready: boolean;
  /** Human-readable loading, playback, or error status. */
  status: string;
  /** Last source loading error, when one is active. */
  error: Error | null;
  /** Loading, selected representation, input attempts, metadata, and recovery by source id. */
  sourceStateById: MediabunnyAdapter['sourceStateById'];
  /** Underlying low-level Mediabunny adapter. */
  adapter: MediabunnyAdapter;
}

const noopAdapter: MediabunnyAdapter = {
  ready: false,
  status: 'Mediabunny is waiting for the browser.',
  error: null,
  lastFrameTime: null,
  sourceStateById: new Map(),
  volume: 0.7,
  muted: false,
  audioStatus: { state: 'unavailable' },
  subscribeFrame: () => () => {},
  syncAdapter: {
    getClockTime: () => 0,
    startClock: () => false,
  },
  setCanvas: () => {},
  getClockTime: () => 0,
  startClock: () => false,
  stopClock: () => {},
  requestClockActivation: () => {},
  setVolume: () => {},
  setMuted: () => {},
  setRepresentation: (sourceId) =>
    Promise.resolve({ ok: false, sourceId, error: new Error('Mediabunny is unavailable.') }),
  retrySource: (sourceId) =>
    Promise.resolve({ ok: false, sourceId, error: new Error('Mediabunny is unavailable.') }),
  replaceSource: (source) =>
    Promise.resolve({
      ok: false,
      sourceId: source.sourceId,
      error: new Error('Mediabunny is unavailable.'),
    }),
  setClockRate: () => {},
  seek: () => Promise.resolve(),
  renderVideo: () => Promise.resolve(),
  syncAudio: () => {},
  syncLayers: () => Promise.resolve(),
  clearVideo: () => {},
  getFrame: () => Promise.resolve(null),
  dispose: () => {},
};

const loadMediabunny = () => import('mediabunny') as Promise<MediabunnyModule>;

/**
 * Create and dispose a Mediabunny timeline adapter from React state.
 *
 * @remarks
 *
 * Use this hook when your app wants to manage transport with
 * {@link useTimelineMediaSync} manually, inspect decoded frame state, or share
 * one adapter across custom preview controls. For a ready-made transport hook,
 * use {@link useMediabunnyTimelineMedia}.
 *
 * @param options - Mediabunny sources, optional canvas ref, audio options, and module loader.
 * @returns The current Mediabunny adapter, including readiness, status, decoded frame state, and sync callbacks.
 *
 * @example
 * ```tsx
 * import { useMemo, useRef } from 'react';
 * import { useMediabunnyAdapter } from '#mediabunny-adapter/react';
 *
 * export function DecoderStatus() {
 *   const canvasRef = useRef<HTMLCanvasElement>(null);
 *   const sources = useMemo(() => [{
 *     sourceId: 'source-1',
 *     input: { kind: 'url', url: '/media/sample.mp4' },
 *   }], []);
 *   const adapter = useMediabunnyAdapter({
 *     canvasRef,
 *     sources,
 *     mediabunny: () => import('mediabunny'),
 *   });
 *
 *   return (
 *     <>
 *       <canvas ref={canvasRef} width={1280} height={720} />
 *       <p>{adapter.status}</p>
 *     </>
 *   );
 * }
 * ```
 *
 * @see {@link MediabunnyAdapter}
 * @see {@link useMediabunnyTimelineMedia}
 */
export function useMediabunnyAdapter(options: UseMediabunnyAdapterOptions): MediabunnyAdapter {
  const {
    audio,
    audioTrackKinds,
    canvasRef,
    mediabunny,
    selectRepresentation,
    selectTracks,
    sources,
    visualTrackKinds,
  } = options;
  const [, forceUpdate] = useReducer((value: number) => value + 1, 0);
  const [adapter, setAdapter] = useState<MediabunnyAdapter>(noopAdapter);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const nextAdapter = createMediabunnyAdapter({
      audio,
      audioTrackKinds,
      mediabunny,
      selectRepresentation,
      selectTracks,
      sources,
      visualTrackKinds,
      onChange: forceUpdate,
    });
    setAdapter(nextAdapter);

    return () => {
      nextAdapter.dispose();
    };
  }, [
    audio,
    audioTrackKinds,
    mediabunny,
    selectRepresentation,
    selectTracks,
    sources,
    visualTrackKinds,
  ]);

  useEffect(() => {
    adapter.setCanvas(canvasRef?.current ?? null);
  }, [adapter, canvasRef]);

  return adapter;
}

/**
 * Subscribe to the latest decoded preview frame without re-rendering ordinary media consumers.
 *
 * @param adapter - Mediabunny adapter whose rendered frame timestamp should be observed.
 * @returns Timestamp of the latest rendered source frame, or `null` before a frame is available.
 */
export function useMediabunnyFrameTime(adapter: MediabunnyAdapter): number | null {
  return useSyncExternalStore(
    adapter.subscribeFrame,
    () => adapter.lastFrameTime,
    () => adapter.lastFrameTime
  );
}

/**
 * Create a Mediabunny adapter and bind it to timeline-synchronized playback.
 *
 * @remarks
 *
 * This is the high-level React hook for decoded media previews. It is the same
 * shape used by the media sync demo and the full editor demo: define stable
 * `visuals` and `audio` layers, pass sources keyed by timeline clip `sourceId`,
 * and drive toolbar buttons from the returned `play`, `pause`, and
 * `setPlaybackRate` commands.
 *
 * @param options - Mediabunny sources, active layers, optional canvas ref, and sync options.
 * @template LayerName - Named media layer keys inferred from `options.layers`,
 * such as `"visuals" | "audio"`.
 * @returns Timeline transport state, active layer data, decoded frame status, source durations, and the low-level adapter.
 *
 * @example
 * ```tsx
 * import { useMemo, useRef } from 'react';
 * import { useMediabunnyTimelineMedia } from '#mediabunny-adapter/react';
 *
 * type PreviewLayerName = 'visuals' | 'audio';
 *
 * const previewLayers = {
 *   visuals: { trackKind: 'visual' },
 *   audio: { trackKind: 'audio' },
 * } as const;
 *
 * export function DecodedPreview() {
 *   const canvasRef = useRef<HTMLCanvasElement>(null);
 *   const sources = useMemo(() => [{
 *     sourceId: 'source-1',
 *     input: { kind: 'url', url: '/media/interview.mp4' },
 *   }], []);
 *   const media = useMediabunnyTimelineMedia<PreviewLayerName>({
 *     canvasRef,
 *     sources,
 *     layers: previewLayers,
 *     onError: console.error,
 *   });
 *
 *   return (
 *     <>
 *       <canvas ref={canvasRef} width={1280} height={720} />
 *       <button type="button" disabled={!media.ready} onClick={() => void media.play()}>
 *         {media.playing ? 'Playing' : 'Play'}
 *       </button>
 *       <span>{media.status}</span>
 *     </>
 *   );
 * }
 * ```
 *
 * @see {@link useTimelineMediaSync}
 * @see {@link https://canvastimeline.com/demos/media-preview-sync | Mediabunny media sync demo}
 * @see {@link https://canvastimeline.com/demos/full-editor-demo | Full editor demo}
 */
export function useMediabunnyTimelineMedia<LayerName extends string = string>(
  options: UseMediabunnyTimelineMediaOptions<LayerName>
): UseMediabunnyTimelineMediaResult<LayerName> {
  const {
    audio,
    audioTrackKinds,
    canvasRef,
    frameRate,
    layers,
    mediabunny = loadMediabunny,
    onError,
    playbackOptions,
    selectTracks,
    sources,
    visualTrackKinds,
  } = options;
  const adapter = useMediabunnyAdapter({
    audio,
    audioTrackKinds,
    canvasRef,
    mediabunny,
    selectTracks,
    sources,
    visualTrackKinds,
  });
  const mediaSync = useTimelineMediaSync<LayerName>({
    ready: adapter.ready,
    frameRate,
    layers,
    adapter: adapter.syncAdapter,
    onError,
    playbackOptions,
  });

  return {
    ...mediaSync,
    ready: adapter.ready,
    status: adapter.status,
    error: adapter.error,
    sourceStateById: adapter.sourceStateById,
    adapter,
  };
}
