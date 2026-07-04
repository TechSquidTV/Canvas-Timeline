import { useEffect, useReducer, useState, type RefObject } from 'react';
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
} from './index';

/**
 * Options for creating a Mediabunny adapter from React.
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
 */
export interface UseMediabunnyTimelineMediaOptions<LayerName extends string = string>
  extends
    Omit<UseMediabunnyAdapterOptions, 'mediabunny'>,
    Pick<UseTimelineMediaSyncOptions<LayerName>, 'layers' | 'onError'> {
  /** Mediabunny module instance or lazy browser loader. Defaults to a browser import. */
  mediabunny?: CreateMediabunnyAdapterOptions['mediabunny'];
}

/**
 * Timeline transport state plus Mediabunny preview status and adapter details.
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
  /** Timestamp of the last rendered video frame, in seconds. */
  lastFrameTime: number | null;
  /** Loaded media duration by source id, in seconds. */
  durationBySourceId: ReadonlyMap<string, number>;
  /** Underlying low-level Mediabunny adapter. */
  adapter: MediabunnyAdapter;
}

const noopAdapter: MediabunnyAdapter = {
  ready: false,
  status: 'Mediabunny is waiting for the browser.',
  error: null,
  lastFrameTime: null,
  durationBySourceId: new Map(),
  syncAdapter: {
    getClockTime: () => 0,
    startClock: () => false,
  },
  setCanvas: () => {},
  getClockTime: () => 0,
  startClock: () => false,
  stopClock: () => {},
  resumeClock: () => Promise.resolve(),
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
 * @param options - Mediabunny sources, optional canvas ref, audio options, and module loader.
 */
export function useMediabunnyAdapter(options: UseMediabunnyAdapterOptions): MediabunnyAdapter {
  const { audio, audioTrackKinds, canvasRef, mediabunny, sources, visualTrackKinds } = options;
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
      sources,
      visualTrackKinds,
      onChange: forceUpdate,
    });
    setAdapter(nextAdapter);

    return () => {
      nextAdapter.dispose();
    };
  }, [audio, audioTrackKinds, mediabunny, sources, visualTrackKinds]);

  useEffect(() => {
    adapter.setCanvas(canvasRef?.current ?? null);
  }, [adapter, canvasRef]);

  return adapter;
}

/**
 * Create a Mediabunny adapter and bind it to timeline-synchronized playback.
 *
 * @param options - Mediabunny sources, active layers, optional canvas ref, and sync options.
 */
export function useMediabunnyTimelineMedia<LayerName extends string = string>(
  options: UseMediabunnyTimelineMediaOptions<LayerName>
): UseMediabunnyTimelineMediaResult<LayerName> {
  const {
    audio,
    audioTrackKinds,
    canvasRef,
    layers,
    mediabunny = loadMediabunny,
    onError,
    sources,
    visualTrackKinds,
  } = options;
  const adapter = useMediabunnyAdapter({
    audio,
    audioTrackKinds,
    canvasRef,
    mediabunny,
    sources,
    visualTrackKinds,
  });
  const mediaSync = useTimelineMediaSync<LayerName>({
    ready: adapter.ready,
    layers,
    adapter: adapter.syncAdapter,
    onError,
  });

  return {
    ...mediaSync,
    ready: adapter.ready,
    status: adapter.status,
    error: adapter.error,
    lastFrameTime: adapter.lastFrameTime,
    durationBySourceId: adapter.durationBySourceId,
    adapter,
  };
}
