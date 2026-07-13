import type {
  ActiveLayerSelector,
  ActiveLayerResult,
  MaybePromise,
  PlaybackOptions,
} from '@techsquidtv/canvas-timeline-core';
import { rationalEquals, type RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useActiveLayers } from '#react/hooks/clips/useActiveLayers';
import { quantizeTimelineTimeToFrame } from '#react/hooks/playback/playbackFrameTime';
import {
  useTimelineMediaPlayback,
  type TimelineLayerSyncDetails,
  type UseTimelineMediaPlaybackOptions,
} from '#react/hooks/playback/useTimelineMediaPlayback';
import { useTimeline } from '#react/hooks/core/useTimeline';
import type { TimelineCommandResult } from '#react/hooks/core/timelineCommandResult';

/**
 * Adapter callbacks used to connect timeline playback to an external media clock.
 *
 * @remarks
 *
 * Implement this adapter when your media surface owns decoding, rendering, or
 * audio scheduling. {@link useTimelineMediaSync} calls these callbacks after it
 * resolves active clips with {@link ActiveLayerSelector} records and
 * {@link ActiveLayerResult} snapshots.
 *
 * @template LayerName - Named media layer keys from your `layers` object, such
 * as `"visuals"` or `"audio"`.
 */
export interface TimelineMediaSyncAdapter<LayerName extends string = string> {
  /** Returns current timeline seconds from the external media clock. */
  getClockTime: UseTimelineMediaPlaybackOptions<LayerName>['getClockTime'];
  /** Starts the external media clock at a timeline time and playback rate. */
  startClock: (timelineTime: RationalTime, playbackRate: number) => MaybePromise<boolean>;
  /** Stops the external media clock if timeline playback cannot start. */
  stopClock?: () => void;
  /**
   * Starts browser-gated clock activation without awaiting it.
   *
   * Keep permission or audio-resume degradation separate from visual transport;
   * the callback must return immediately so `seek` and `startClock` can proceed.
   */
  requestClockActivation?: (playbackRate: number) => void;
  /** Updates the external clock rate before timeline playback rate changes. */
  setClockRate?: (playbackRate: number) => void;
  /** Refreshes external media after paused playhead or timeline edits. */
  seek?: (
    timelineTime: RationalTime,
    activeLayers: ActiveLayerResult<LayerName>
  ) => MaybePromise<void>;
  /** Synchronizes external rendering, audio, text, or effects for active layers during playback. */
  syncLayers?: (details: TimelineLayerSyncDetails<LayerName>) => MaybePromise<void>;
  /** Receives high-level playback status changes. */
  onStatus?: UseTimelineMediaPlaybackOptions<LayerName>['onStatus'];
}

/** Observable lifecycle state shared by packaged timeline media adapters. */
export type TimelineMediaSourceStatus = 'idle' | 'loading' | 'recovering' | 'ready' | 'failed';

/** Reason a packaged adapter source operation could not be accepted. */
export type TimelineMediaSourceOperationFailureReason =
  | 'unknown-source'
  | 'invalid-source'
  | 'load-failed';

/**
 * Result of retrying or replacing a packaged adapter source.
 *
 * @remarks
 *
 * `configured` means the adapter accepted the source and initiated any native
 * loading required for it. `ready` means the adapter completed source loading
 * before resolving the operation. Observe the adapter's `sourceStateById` for
 * subsequent lifecycle changes and detailed input attempts.
 */
export type TimelineMediaSourceOperationResult =
  | {
      ok: true;
      sourceId: string;
      state: 'configured' | 'ready';
    }
  | {
      ok: false;
      sourceId: string;
      reason: TimelineMediaSourceOperationFailureReason;
      error: Error;
    };

/**
 * Options for high-level timeline media synchronization.
 *
 * @remarks
 *
 * The `layers` record names the media outputs your adapter can synchronize.
 * Those names flow through `LayerName`, allowing `activeLayers.primary.visuals`
 * or `activeLayers.layers.audio` to stay typed from the same object.
 * Each value is an {@link ActiveLayerSelector} passed through active layer
 * lookup before adapter callbacks receive an {@link ActiveLayerResult}.
 *
 * @template LayerName - Named media layer keys inferred from `layers`.
 */
export interface UseTimelineMediaSyncOptions<LayerName extends string = string> {
  /** Whether the external media adapter is loaded and ready to play. */
  ready?: boolean;
  /** Optional sequence frame rate used to lock media playback to project frames. */
  frameRate?: UseTimelineMediaPlaybackOptions<LayerName>['frameRate'];
  /** Core playback range and looping policy applied to the external media clock. */
  playbackOptions?: Omit<PlaybackOptions, 'clock'>;
  /** Named active layer selectors used by the external media surface. */
  layers: Record<LayerName, ActiveLayerSelector>;
  /** External media adapter callbacks. */
  adapter: TimelineMediaSyncAdapter<LayerName>;
  /** Called when no content exists or no active layer clip is available. */
  onError?: (message: string) => void;
}

/**
 * Reason high-level media-synchronized playback could not begin.
 */
export type TimelineMediaPlayFailureReason =
  /** External media adapter has not finished loading. */
  | 'not-ready'
  /** No timeline content exists for the configured active layers. */
  | 'no-content'
  /** Content exists, but no clip is active at the resolved playhead time. */
  | 'no-active-content'
  /** External media clock failed to seek or start. */
  | 'clock-failed'
  /** Timeline engine playback could not start after the external clock started. */
  | 'timeline-failed';

/**
 * Result returned from a media-synchronized timeline play request.
 *
 * This high-level media adapter result is intentionally richer than
 * `TimelineCommandResult` because failures include user-facing adapter messages
 * in addition to machine-readable reasons.
 */
export type TimelineMediaPlayResult =
  /** Playback started successfully at the returned timeline time. */
  | { ok: true; time: RationalTime }
  /** Playback failed before the timeline and external media clock could run together. */
  | {
      ok: false;
      reason: TimelineMediaPlayFailureReason;
      message: string;
      cause?: Error;
    };

function toError(cause: unknown): Error | undefined {
  if (cause instanceof Error) {
    return cause;
  }
  if (cause === undefined || cause === null) {
    return undefined;
  }
  if (typeof cause === 'string') {
    return new Error(cause);
  }
  if (typeof cause === 'number' || typeof cause === 'boolean' || typeof cause === 'bigint') {
    return new Error(cause.toString());
  }
  return new Error('Unknown media adapter error.');
}

function withCauseMessage(message: string, cause: Error | undefined) {
  return cause?.message ? `${message} ${cause.message}` : message;
}

/**
 * Result returned by `useTimelineMediaSync`.
 *
 * @remarks
 *
 * Use the commands in this result for media-aware transport controls. The
 * `activeLayers` snapshot is useful for custom status panels, preview badges,
 * and adapter diagnostics.
 *
 * @template LayerName - Named media layer keys from
 * {@link UseTimelineMediaSyncOptions.layers}.
 */
export interface UseTimelineMediaSyncResult<LayerName extends string = string> {
  /** Active layers at the current playhead time. */
  activeLayers: ActiveLayerResult<LayerName>;
  /** Whether synchronized timeline and external media playback is currently running. */
  playing: boolean;
  /** Current synchronized playback speed multiplier. */
  playbackRate: number;
  /** Starts external media playback and then advances the timeline from that clock. */
  play: () => Promise<TimelineMediaPlayResult>;
  /** Stops synchronized timeline/media playback and pauses external media state. */
  pause: () => TimelineCommandResult;
  /** Updates both the external clock rate and the timeline playback rate. */
  setPlaybackRate: (playbackRate: number) => TimelineCommandResult;
}

function createPlayFailure(
  reason: TimelineMediaPlayFailureReason,
  message: string,
  onError: UseTimelineMediaSyncOptions['onError'],
  cause?: Error
): TimelineMediaPlayResult {
  const result = {
    ok: false,
    reason,
    message: withCauseMessage(message, cause),
    ...(cause !== undefined ? { cause } : {}),
  } as const;
  onError?.(result.message);
  return result;
}

/**
 * High-level synchronization for external media surfaces.
 *
 * @remarks
 *
 * The hook remains media-library agnostic: apps provide an adapter for decoding,
 * rendering, and audio scheduling, while the hook handles active layer lookup,
 * first-content seeking, external-clock playback, rate changes, and pause state.
 * It builds on {@link useTimelineMediaPlayback} for external-clock playback.
 * For packaged adapters, prefer the higher-level HTML and Mediabunny hooks first;
 * use this hook when you are building a custom clock or preview surface.
 *
 * @param options - External media adapter, readiness state, active layers, and callbacks.
 * @template LayerName - Named media layer keys inferred from `options.layers`,
 * such as `"visuals" | "audio"`.
 * @returns Media transport state, active layer data, and synchronized playback commands.
 *
 * @example
 * ```tsx
 * import { useMemo, useRef } from 'react';
 * import { useTimelineMediaSync } from '@techsquidtv/canvas-timeline-react';
 *
 * const previewLayerSelectors = {
 *   visuals: { trackKind: 'visual', sourceId: 'source-1' },
 *   audio: { trackKind: 'audio', sourceId: 'source-1' },
 * } as const;
 *
 * export function CustomMediaPreview() {
 *   const mediaTimeRef = useRef(0);
 *   const layers = useMemo(() => previewLayerSelectors, []);
 *   const mediaSync = useTimelineMediaSync({
 *     ready: true,
 *     layers,
 *     adapter: {
 *       getClockTime: () => mediaTimeRef.current,
 *       startClock: (timelineTime, playbackRate) => {
 *         mediaTimeRef.current = timelineTime.v / timelineTime.r;
 *         console.info(`Start media at ${playbackRate}x`);
 *         return true;
 *       },
 *       stopClock: () => {
 *         console.info('Pause external media');
 *       },
 *       syncLayers: ({ activeLayers }) => {
 *         const visualClip = activeLayers.primary.visuals?.clip;
 *         console.info(visualClip ? `Render ${visualClip.id}` : 'No visual clip');
 *       },
 *     },
 *   });
 *
 *   return (
 *     <button type="button" onClick={() => void mediaSync.play()}>
 *       {mediaSync.playing ? 'Playing' : 'Play'}
 *     </button>
 *   );
 * }
 * ```
 *
 * @see {@link ActiveLayerSelector}
 * @see {@link ActiveLayerResult}
 * @see {@link useTimelineMediaPlayback}
 * @see {@link https://canvastimeline.com/demos/media-preview-sync | Mediabunny media sync demo}
 * @see {@link https://canvastimeline.com/demos/html-media-sync | HTML media sync demo}
 */
export function useTimelineMediaSync<LayerName extends string = string>(
  options: UseTimelineMediaSyncOptions<LayerName>
): UseTimelineMediaSyncResult<LayerName> {
  const { adapter, frameRate, layers, onError, playbackOptions, ready = true } = options;
  const adapterSeek = adapter.seek;
  const { engine } = useTimeline();
  const activeLayers = useActiveLayers<LayerName>({ layers });
  const adapterRef = useRef(adapter);
  const layersRef = useRef(layers);
  const initialSeekScheduledRef = useRef(false);
  const previewSeekFrameRef = useRef<number | null>(null);
  const readyRef = useRef(ready);
  const onErrorRef = useRef(onError);

  const syncPlayback = useTimelineMediaPlayback<LayerName>({
    frameRate,
    playbackOptions,
    getClockTime: adapter.getClockTime,
    stopClock: adapter.stopClock,
    layers,
    syncLayers: adapter.syncLayers,
    onStatus: adapter.onStatus,
    onLoop: async (timelineTime, loopLayers) => {
      await adapter.seek?.(timelineTime, loopLayers);
      if (!(await adapter.startClock(timelineTime, engine.getPlaybackRate()))) {
        throw new Error('Media clock could not restart after looping.');
      }
    },
  });
  const playingRef = useRef(syncPlayback.playing);

  useEffect(() => {
    adapterRef.current = adapter;
    layersRef.current = layers;
    playingRef.current = syncPlayback.playing;
    readyRef.current = ready;
    onErrorRef.current = onError;
  }, [adapter, layers, onError, ready, syncPlayback.playing]);

  const cancelScheduledSeek = useCallback(() => {
    if (previewSeekFrameRef.current !== null) {
      cancelAnimationFrame(previewSeekFrameRef.current);
      previewSeekFrameRef.current = null;
    }
  }, []);

  const schedulePausedPreviewSeek = useCallback(() => {
    if (!readyRef.current || playingRef.current || adapterRef.current.seek === undefined) {
      return;
    }
    if (previewSeekFrameRef.current !== null) {
      return;
    }

    previewSeekFrameRef.current = requestAnimationFrame(() => {
      previewSeekFrameRef.current = null;
      const currentAdapter = adapterRef.current;
      if (!readyRef.current || playingRef.current || currentAdapter.seek === undefined) {
        return;
      }

      const timelineTime = engine.getTime();
      const currentActiveLayers = engine.getActiveLayers({
        time: timelineTime,
        layers: layersRef.current,
      });
      void Promise.resolve(currentAdapter.seek(timelineTime, currentActiveLayers)).catch(
        (seekError: unknown) => {
          const cause = toError(seekError);
          onErrorRef.current?.(withCauseMessage('Media seek failed.', cause));
        }
      );
    });
  }, [engine]);

  useEffect(() => {
    const unsubscribers = [
      engine.on('playhead:scrub', schedulePausedPreviewSeek),
      engine.on('content:change', schedulePausedPreviewSeek),
      engine.on('playback:state', (playing) => {
        playingRef.current = playing;
        if (playing) {
          cancelScheduledSeek();
        } else {
          schedulePausedPreviewSeek();
        }
      }),
    ];

    return () => {
      cancelScheduledSeek();
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, [cancelScheduledSeek, engine, schedulePausedPreviewSeek]);

  useEffect(() => {
    if (!ready || adapterSeek === undefined) {
      initialSeekScheduledRef.current = false;
      return;
    }

    if (initialSeekScheduledRef.current) {
      return;
    }

    initialSeekScheduledRef.current = true;
    schedulePausedPreviewSeek();
  }, [adapterSeek, ready, schedulePausedPreviewSeek]);

  const play = useCallback(async (): Promise<TimelineMediaPlayResult> => {
    if (!ready) {
      return createPlayFailure('not-ready', 'Media adapter is not ready.', onError);
    }

    const currentTime = engine.getTime();
    const resolvedStartTime = engine.getPlaybackStartTime(playbackOptions);
    let timelineTime = quantizeTimelineTimeToFrame(resolvedStartTime, frameRate);
    if (!rationalEquals(currentTime, timelineTime)) {
      engine.setTime(timelineTime);
    }
    let timelineLayers = engine.getActiveLayers({
      time: timelineTime,
      layers,
    });

    if (!timelineLayers.hasActiveClips) {
      const firstContentTime = engine.getFirstContentTime({ layers });
      if (firstContentTime === undefined) {
        return createPlayFailure('no-content', 'No timeline content is available.', onError);
      }

      timelineTime = quantizeTimelineTimeToFrame(firstContentTime, frameRate, 'ceil');
      engine.setTime(timelineTime);
      timelineLayers = engine.getActiveLayers({
        time: timelineTime,
        layers,
      });
    }

    if (!timelineLayers.hasActiveClips) {
      return createPlayFailure(
        'no-active-content',
        'No active timeline content is available.',
        onError
      );
    }

    try {
      adapter.requestClockActivation?.(syncPlayback.playbackRate);
      await adapter.seek?.(timelineTime, timelineLayers);
      if (!(await adapter.startClock(timelineTime, syncPlayback.playbackRate))) {
        adapter.stopClock?.();
        return createPlayFailure('clock-failed', 'Media clock could not start.', onError);
      }
    } catch (clockError: unknown) {
      adapter.stopClock?.();
      return createPlayFailure(
        'clock-failed',
        'Media clock could not start.',
        onError,
        toError(clockError)
      );
    }

    let timelineStarted = false;
    try {
      timelineStarted = syncPlayback.play().ok;
    } catch (timelineError: unknown) {
      adapter.stopClock?.();
      return createPlayFailure(
        'timeline-failed',
        'Timeline playback could not start.',
        onError,
        toError(timelineError)
      );
    }

    if (!timelineStarted) {
      adapter.stopClock?.();
      return createPlayFailure('timeline-failed', 'Timeline playback could not start.', onError);
    }

    return { ok: true, time: timelineTime };
  }, [adapter, engine, frameRate, layers, onError, playbackOptions, ready, syncPlayback]);

  const setPlaybackRate = useCallback(
    (playbackRate: number) => {
      adapter.setClockRate?.(playbackRate);
      return syncPlayback.setPlaybackRate(playbackRate);
    },
    [adapter, syncPlayback]
  );

  return useMemo(
    () => ({
      /** Active layers at the current playhead time. */
      activeLayers,
      /** Whether synchronized timeline/media playback is currently running. */
      playing: syncPlayback.playing,
      /** Current synchronized playback speed multiplier. */
      playbackRate: syncPlayback.playbackRate,
      /** Starts external media playback and then advances the timeline from that clock. */
      play,
      /** Stops synchronized timeline/media playback. */
      pause: syncPlayback.pause,
      /** Updates both the external clock rate and the timeline playback rate. */
      setPlaybackRate,
    }),
    [
      activeLayers,
      play,
      setPlaybackRate,
      syncPlayback.playing,
      syncPlayback.pause,
      syncPlayback.playbackRate,
    ]
  );
}
