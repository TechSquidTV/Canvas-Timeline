import type {
  ActiveLayerResult,
  ActiveLayerSelector,
  MaybePromise,
  PlaybackOptions,
  TimelineContentPlaybackStatus,
  TimelineLayerSyncDetails,
  TimelineMediaSyncReason,
} from '@techsquidtv/canvas-timeline-core';
import {
  fromSeconds,
  fromTimecodeFrameNumber,
  rationalEquals,
  resolveTimecodeFrameRate,
  toSeconds,
  type RationalTime,
  type TimecodeFrameRate,
} from '@techsquidtv/canvas-timeline-utils';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { quantizeTimelineTimeToFrame } from '#react/hooks/playback/playbackFrameTime';
import { useTimeline } from '#react/hooks/core/useTimeline';
import {
  timelineCommandFail,
  timelineCommandOk,
  type TimelineCommandResult,
} from '#react/hooks/core/timelineCommandResult';

/**
 * Options for coordinating timeline playback with an external media clock.
 *
 * @remarks
 *
 * Use this hook when your preview surface owns the media clock. The hook tells
 * {@link https://canvastimeline.com/packages/core/api/timeline-engine | TimelineEngine}
 * to play with an external clock, reads timeline seconds from `getClockTime`,
 * and calls `syncLayers` with an {@link ActiveLayerResult} whenever active
 * clips need to be rendered, sought, or paused.
 *
 * Higher-level adapters such as `useHTMLTimelineMedia` and
 * `useMediabunnyTimelineMedia` wrap this contract for common media stacks.
 *
 * @template LayerName - Named media layer keys inferred from `layers`, such as
 * `"visuals" | "audio"`.
 *
 * @see {@link TimelineLayerSyncDetails}
 * @see {@link useTimelineMediaSync}
 * @see {@link https://canvastimeline.com/demos/media-preview-sync | Mediabunny media sync demo}
 */
export interface UseTimelineMediaPlaybackOptions<LayerName extends string = string> {
  /** Returns current timeline seconds from the external media clock. */
  getClockTime: () => number;
  /** Optional sequence frame rate used to quantize playback updates to project frames. */
  frameRate?: TimecodeFrameRate;
  /** Core playback range policy applied to the external clock; looping is configured by `loop`. */
  playbackOptions?: Omit<PlaybackOptions, 'clock' | 'loop'>;
  /** Stops the external media clock when timeline playback pauses or leaves active content. */
  stopClock?: () => void;
  /** Named active layer selectors used by the external media surface. */
  layers: Record<LayerName, ActiveLayerSelector>;
  /** Synchronizes external rendering, audio, text, or effects for the active layers. */
  syncLayers?: (details: TimelineLayerSyncDetails<LayerName>) => MaybePromise<void>;
  /**
   * Enables looping and realigns the external clock after Core returns to the range start.
   * The callback is invoked once per loop transition until the clock re-enters range.
   */
  loop?: (
    timelineTime: RationalTime,
    activeLayers: ActiveLayerResult<LayerName>
  ) => MaybePromise<void>;
  /** Receives high-level playback status changes. */
  onStatus?: (status: TimelineContentPlaybackStatus) => void;
}

interface PlaybackFrameCursor {
  frameNumber: number;
  frameRate: number;
}

function getPlaybackFrameNumber(seconds: number, frameRate: TimecodeFrameRate) {
  const resolvedFrameRate = resolveTimecodeFrameRate(frameRate);
  const frameNumber = Math.max(0, Math.floor(Math.max(0, seconds) * resolvedFrameRate + 1e-9));
  return { frameNumber, frameRate: resolvedFrameRate };
}

/**
 * Result returned by `useTimelineMediaPlayback`.
 *
 * @remarks
 *
 * These commands operate on the timeline engine and return
 * {@link TimelineCommandResult} values so toolbar code can show disabled,
 * content-gap, or unsupported-clock feedback without reading private engine
 * state.
 */
export interface UseTimelineMediaPlaybackResult {
  /** Whether the timeline engine is currently playing against the external clock. */
  playing: boolean;
  /** Current timeline playback speed multiplier. */
  playbackRate: number;
  /** Starts timeline playback using the configured external clock callbacks. */
  play: () => TimelineCommandResult;
  /** Stops timeline playback and synchronizes external media into a paused state. */
  pause: () => TimelineCommandResult;
  /** Updates the timeline playback rate and resynchronizes active layers. */
  setPlaybackRate: (rate: number) => TimelineCommandResult;
}

function safelySyncLayers<LayerName extends string>(
  syncLayers: UseTimelineMediaPlaybackOptions<LayerName>['syncLayers'],
  details: TimelineLayerSyncDetails<LayerName>
) {
  try {
    void Promise.resolve(syncLayers?.(details)).catch(() => undefined);
  } catch {
    // Adapter cleanup should not throw during pause or unmount.
  }
}

function isPromiseLike(value: MaybePromise<void> | undefined): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

/**
 * Coordinates timeline playback with an external media clock.
 *
 * @remarks
 *
 * The hook is media-library agnostic. Apps provide a clock and a single layer
 * sync callback while the hook advances the TimelineEngine playhead and decides
 * when active layer clips need to be resynchronized.
 *
 * @param options - External media clock, active layer selectors, sync callback, and status callback.
 * @template LayerName - Named media layer keys inferred from `options.layers`,
 * such as `"visuals" | "audio"`.
 * @returns Timeline playback state and commands backed by the external media clock.
 *
 * @example
 * ```tsx
 * import { useMemo, useRef } from 'react';
 * import { useTimelineMediaPlayback } from '@techsquidtv/canvas-timeline-react/hooks';
 *
 * const previewLayers = {
 *   visuals: { trackKind: 'visual' },
 *   audio: { trackKind: 'audio' },
 * } as const;
 *
 * export function CustomClockTransport() {
 *   const clockSecondsRef = useRef(0);
 *   const layers = useMemo(() => previewLayers, []);
 *   const playback = useTimelineMediaPlayback({
 *     layers,
 *     getClockTime: () => clockSecondsRef.current,
 *     stopClock: () => {
 *       clockSecondsRef.current = 0;
 *     },
 *     syncLayers: ({ activeLayers, reason }) => {
 *       const visualClip = activeLayers.primary.visuals?.clip;
 *       console.info(reason, visualClip?.id ?? 'blank frame');
 *     },
 *   });
 *
 *   return (
 *     <button type="button" onClick={() => playback.playing ? playback.pause() : playback.play()}>
 *       {playback.playing ? 'Pause' : 'Play'}
 *     </button>
 *   );
 * }
 * ```
 *
 * @see {@link ActiveLayerSelector}
 * @see {@link ActiveLayerResult}
 * @see {@link useTimelineMediaSync}
 * @see {@link https://canvastimeline.com/docs/react-hooks | React editor hooks}
 */
export function useTimelineMediaPlayback<LayerName extends string = string>(
  options: UseTimelineMediaPlaybackOptions<LayerName>
): UseTimelineMediaPlaybackResult {
  const { engine, state } = useTimeline();
  const optionsRef = useRef(options);
  const animationFrameRef = useRef<number | null>(null);
  const pausingRef = useRef(false);
  const playbackFrameCursorRef = useRef<PlaybackFrameCursor | null>(null);
  const loopTransitionRef = useRef<object | null>(null);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const cancelTick = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const getActiveLayers = useCallback(
    (time: RationalTime) => {
      return engine.getActiveLayers({
        time,
        layers: optionsRef.current.layers,
      });
    },
    [engine]
  );

  const synchronizeLayers = useCallback(
    (timelineTime: RationalTime, reason: TimelineMediaSyncReason) => {
      const currentOptions = optionsRef.current;
      const activeLayers = getActiveLayers(timelineTime);

      const syncResult = currentOptions.syncLayers?.({
        activeLayers,
        timelineTime,
        reason,
      });
      if (isPromiseLike(syncResult)) {
        void Promise.resolve(syncResult).catch(() => {
          currentOptions.stopClock?.();
          if (engine.getState().playing) {
            engine.pause();
          }
          currentOptions.onStatus?.('paused');
        });
      }

      return activeLayers;
    },
    [engine, getActiveLayers]
  );

  const pause = useCallback(
    (status: TimelineContentPlaybackStatus = 'paused') => {
      if (status === 'paused' && animationFrameRef.current === null && !engine.getState().playing) {
        return;
      }
      if (pausingRef.current) {
        return;
      }

      pausingRef.current = true;
      cancelTick();
      playbackFrameCursorRef.current = null;
      loopTransitionRef.current = null;
      try {
        const timelineTime = engine.getTime();
        const currentOptions = optionsRef.current;
        currentOptions.stopClock?.();
        safelySyncLayers(currentOptions.syncLayers, {
          activeLayers: getActiveLayers(timelineTime),
          timelineTime,
          reason: status === 'content-gap' ? 'gap' : 'pause',
        });
        if (engine.getState().playing) {
          engine.pause();
        }
        currentOptions.onStatus?.(status);
      } finally {
        pausingRef.current = false;
      }
    },
    [cancelTick, engine, getActiveLayers]
  );

  const pausePlayback = useCallback(() => {
    pause('paused');
    return timelineCommandOk();
  }, [pause]);

  const play = useCallback(() => {
    const currentOptions = optionsRef.current;
    loopTransitionRef.current = null;
    const currentTime = engine.getTime();
    const playbackOptions = {
      ...currentOptions.playbackOptions,
      loop: currentOptions.loop !== undefined,
    };
    const resolvedStartTime = engine.getPlaybackStartTime(playbackOptions);
    const startTime = quantizeTimelineTimeToFrame(resolvedStartTime, currentOptions.frameRate);
    if (!rationalEquals(currentTime, startTime)) {
      engine.setTime(startTime);
    }
    playbackFrameCursorRef.current =
      currentOptions.frameRate === undefined
        ? null
        : getPlaybackFrameNumber(toSeconds(startTime), currentOptions.frameRate);
    const activeLayers = synchronizeLayers(startTime, 'play');
    if (!activeLayers.hasActiveClips) {
      pause('content-gap');
      return timelineCommandFail('content-gap');
    }

    const started = engine.play({ ...playbackOptions, clock: 'external' });
    if (!started) {
      return timelineCommandFail('unsupported');
    }

    optionsRef.current.onStatus?.('playing');

    const tick = () => {
      if (!engine.getState().playing) {
        pause('paused');
        return;
      }

      const currentOptions = optionsRef.current;
      const clockSeconds = currentOptions.getClockTime();
      let timelineTime: RationalTime;

      if (currentOptions.frameRate === undefined) {
        playbackFrameCursorRef.current = null;
        timelineTime = fromSeconds(clockSeconds, engine.getTime().r);
      } else {
        const nextCursor = getPlaybackFrameNumber(clockSeconds, currentOptions.frameRate);
        const currentCursor = playbackFrameCursorRef.current;
        if (
          currentCursor?.frameNumber === nextCursor.frameNumber &&
          currentCursor.frameRate === nextCursor.frameRate
        ) {
          animationFrameRef.current = requestAnimationFrame(tick);
          return;
        }

        playbackFrameCursorRef.current = nextCursor;
        timelineTime = fromTimecodeFrameNumber(
          nextCursor.frameNumber,
          currentOptions.frameRate,
          engine.getTime().r
        );
      }

      const update = engine.updateExternalPlaybackTime(timelineTime);
      const nextActiveLayers = synchronizeLayers(update.time, 'tick');
      if (update.action !== 'loop') {
        loopTransitionRef.current = null;
      } else if (loopTransitionRef.current === null) {
        const transition = {};
        loopTransitionRef.current = transition;
        try {
          const loopResult = currentOptions.loop?.(update.time, nextActiveLayers);
          if (isPromiseLike(loopResult)) {
            void Promise.resolve(loopResult).catch(() => {
              if (loopTransitionRef.current === transition) {
                pause('paused');
              }
            });
          }
        } catch {
          if (loopTransitionRef.current === transition) {
            pause('paused');
          }
          return;
        }
      }
      if (update.action === 'pause') {
        pause('paused');
        return;
      }
      if (!nextActiveLayers.hasActiveClips) {
        pause('content-gap');
        return;
      }

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);
    return timelineCommandOk();
  }, [engine, pause, synchronizeLayers]);

  const setPlaybackRate = useCallback(
    (rate: number) => {
      engine.setPlaybackRate(rate);
      synchronizeLayers(engine.getTime(), 'rate');
      return timelineCommandOk();
    },
    [engine, synchronizeLayers]
  );

  useEffect(
    () =>
      engine.on('playback:state', (playing) => {
        if (!playing) {
          pause('paused');
        }
      }),
    [engine, pause]
  );

  useEffect(
    () => () => {
      cancelTick();
      const timelineTime = engine.getTime();
      optionsRef.current.stopClock?.();
      safelySyncLayers(optionsRef.current.syncLayers, {
        activeLayers: getActiveLayers(timelineTime),
        timelineTime,
        reason: 'pause',
      });
      engine.pause();
    },
    [cancelTick, engine, getActiveLayers]
  );

  return useMemo(
    () => ({
      playing: state.playing ?? false,
      playbackRate: state.playbackRate ?? 1,
      play,
      pause: pausePlayback,
      setPlaybackRate,
    }),
    [pausePlayback, play, setPlaybackRate, state.playing, state.playbackRate]
  );
}
