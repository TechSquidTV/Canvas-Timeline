import {
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
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
  /** Whether at least one Mediabunny source is registered for lazy loading. */
  ready: boolean;
  /** Human-readable loading, playback, or error status. */
  status: string;
  /** Last source loading error, when one is active. */
  error: Error | null;
  /** Loading, input attempts, metadata, and recovery by source id. */
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
  setSources: () => {},
  preloadSource: (sourceId) =>
    Promise.resolve({
      ok: false,
      sourceId,
      reason: 'unknown-source',
      error: new Error('Mediabunny is unavailable.'),
    }),
  unloadSource: () => false,
  retrySource: (sourceId) =>
    Promise.resolve({
      ok: false,
      sourceId,
      reason: 'unknown-source',
      error: new Error('Mediabunny is unavailable.'),
    }),
  replaceSource: (source) =>
    Promise.resolve({
      ok: false,
      sourceId: source.sourceId,
      reason: 'load-failed',
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

function useStableStringArray(values: readonly string[] | undefined) {
  const valuesRef = useRef(values);
  const previous = valuesRef.current;
  if (
    previous === undefined ||
    values === undefined ||
    previous.length !== values.length ||
    previous.some((value, index) => value !== values[index])
  ) {
    valuesRef.current = values;
  }
  return valuesRef.current;
}

/**
 * Create and dispose a Mediabunny timeline adapter from React state.
 *
 * @remarks
 *
 * Use this hook when your app wants to manage transport with
 * {@link useTimelineMediaSync} manually, inspect decoded frame state, or share
 * one adapter across custom preview controls. For a ready-made transport hook,
 * use {@link useMediabunnyTimelineMedia}. Ordinary URL source arrays are
 * reconciled by value; keep factories, track selectors, and custom option
 * objects stable because their identity represents executable policy.
 *
 * @param options - Mediabunny sources, optional canvas ref, audio options, and module loader.
 * @returns The current Mediabunny adapter, including readiness, status, decoded frame state, and sync callbacks.
 *
 * @example
 * ```tsx
 * import { useRef } from 'react';
 * import { useMediabunnyAdapter } from '@techsquidtv/canvas-timeline-mediabunny-adapter/react';
 *
 * const sources = [{
 *   sourceId: 'source-1',
 *   input: '/media/sample.mp4',
 * }];
 *
 * export function DecoderStatus() {
 *   const canvasRef = useRef<HTMLCanvasElement>(null);
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
  const { audio, audioTrackKinds, canvasRef, mediabunny, selectTracks, sources, visualTrackKinds } =
    options;
  const stableAudioTrackKinds = useStableStringArray(audioTrackKinds);
  const stableVisualTrackKinds = useStableStringArray(visualTrackKinds);
  const sourcesRef = useRef(sources);
  const runtimeValuesRef = useRef({ volume: audio?.volume, muted: audio?.muted });
  const [, forceUpdate] = useReducer((value: number) => value + 1, 0);
  const [adapter, setAdapter] = useState<MediabunnyAdapter>(noopAdapter);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const nextAdapter = createMediabunnyAdapter({
      audio: {
        context: audio?.context,
        destination: audio?.destination,
        activationTimeoutMs: audio?.activationTimeoutMs,
        volume: runtimeValuesRef.current.volume,
        muted: runtimeValuesRef.current.muted,
      },
      audioTrackKinds: stableAudioTrackKinds,
      mediabunny,
      selectTracks,
      sources: sourcesRef.current,
      visualTrackKinds: stableVisualTrackKinds,
      onChange: forceUpdate,
    });
    setAdapter(nextAdapter);

    return () => {
      nextAdapter.dispose();
    };
  }, [
    audio?.activationTimeoutMs,
    audio?.context,
    audio?.destination,
    mediabunny,
    selectTracks,
    stableAudioTrackKinds,
    stableVisualTrackKinds,
  ]);

  useEffect(() => adapter.setSources(sources), [adapter, sources]);

  useEffect(() => {
    if (audio?.volume !== undefined && adapter.volume !== audio.volume) {
      adapter.setVolume(audio.volume);
    }
  }, [adapter, audio?.volume]);

  useEffect(() => {
    if (audio?.muted !== undefined && adapter.muted !== audio.muted) {
      adapter.setMuted(audio.muted);
    }
  }, [adapter, audio?.muted]);

  useEffect(() => {
    adapter.setCanvas(canvasRef?.current ?? null);
  }, [adapter, canvasRef]);

  sourcesRef.current = sources;
  runtimeValuesRef.current = { volume: audio?.volume, muted: audio?.muted };

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
 * shape used by the media sync demo and the full editor demo: define named
 * `visuals` and `audio` layers, pass sources keyed by timeline clip `sourceId`,
 * and drive toolbar buttons from the returned `play`, `pause`, and
 * `setPlaybackRate` commands. `ready` means at least one source is registered;
 * inspect `sourceStateById` for per-source idle, loading, and ready state.
 *
 * @param options - Mediabunny sources, active layers, optional canvas ref, and sync options.
 * @template LayerName - Named media layer keys inferred from `options.layers`,
 * such as `"visuals" | "audio"`.
 * @returns Timeline transport state, active layer data, source diagnostics, and the low-level adapter.
 *
 * @example
 * ```tsx
 * import { useRef } from 'react';
 * import { useMediabunnyTimelineMedia } from '@techsquidtv/canvas-timeline-mediabunny-adapter/react';
 *
 * type PreviewLayerName = 'visuals' | 'audio';
 *
 * const previewLayers = {
 *   visuals: { trackKind: 'visual' },
 *   audio: { trackKind: 'audio' },
 * } as const;
 * const sources = [{
 *   sourceId: 'source-1',
 *   input: '/media/interview.mp4',
 * }];
 *
 * export function DecodedPreview() {
 *   const canvasRef = useRef<HTMLCanvasElement>(null);
 *   const media = useMediabunnyTimelineMedia<PreviewLayerName>({
 *     canvasRef,
 *     sources,
 *     layers: previewLayers,
 *     onError: (error) => console.error(error.reason, error.message),
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
