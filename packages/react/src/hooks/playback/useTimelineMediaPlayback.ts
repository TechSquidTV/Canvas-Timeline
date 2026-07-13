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
import { toMediaError } from '#react/hooks/playback/mediaError';
import { useTimeline } from '#react/hooks/core/useTimeline';
import {
  timelineCommandFail,
  timelineCommandInvalidInput,
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
  /** Applies a validated playback-rate change to the external media clock. */
  setClockRate?: (playbackRate: number) => void;
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
  /** Receives external rendering or scheduling failures before playback is paused. */
  onError?: (error: Error) => void;
}

interface PlaybackFrameCursor {
  frameNumber: number;
  frameRate: number;
}

interface LayerSynchronizationResult<LayerName extends string> {
  activeLayers: ActiveLayerResult<LayerName>;
  error?: Error;
  superseded?: boolean;
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
 * These commands operate on the timeline engine and resolve
 * {@link TimelineCommandResult} values so toolbar code can show disabled,
 * content-gap, invalid-input, or synchronization feedback without reading
 * private engine state. Playback and rate changes await serialized adapter
 * synchronization before resolving.
 */
export interface UseTimelineMediaPlaybackResult {
  /** Whether the timeline engine is currently playing against the external clock. */
  playing: boolean;
  /** Current timeline playback speed multiplier. */
  playbackRate: number;
  /** Starts playback after active external layers finish synchronizing. */
  play: () => Promise<TimelineCommandResult>;
  /** Stops timeline playback and synchronizes external media into a paused state. */
  pause: () => TimelineCommandResult;
  /** Updates both clocks and resolves after active layers resynchronize. */
  setPlaybackRate: (rate: number) => Promise<TimelineCommandResult>;
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
  const playbackGenerationRef = useRef(0);
  const playbackStartGenerationRef = useRef<number | null>(null);
  const synchronizationQueueRef = useRef<Promise<void>>(Promise.resolve());

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

  const pause = useCallback(
    (status: TimelineContentPlaybackStatus = 'paused', force = false) => {
      if (
        !force &&
        status === 'paused' &&
        animationFrameRef.current === null &&
        playbackStartGenerationRef.current === null &&
        !engine.getState().playing
      ) {
        return;
      }
      if (pausingRef.current) {
        return;
      }

      pausingRef.current = true;
      playbackGenerationRef.current += 1;
      playbackStartGenerationRef.current = null;
      synchronizationQueueRef.current = Promise.resolve();
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

  const handleSyncFailure = useCallback(
    (cause: unknown, generation: number) => {
      const syncError = toMediaError(cause);
      if (playbackGenerationRef.current !== generation) {
        return syncError;
      }
      pause('paused', true);
      optionsRef.current.onError?.(syncError);
      return syncError;
    },
    [pause]
  );

  const synchronizeLayers = useCallback(
    (
      timelineTime: RationalTime,
      reason: TimelineMediaSyncReason,
      generation: number
    ): Promise<LayerSynchronizationResult<LayerName>> => {
      const activeLayers = getActiveLayers(timelineTime);
      const synchronize = async (): Promise<LayerSynchronizationResult<LayerName>> => {
        if (playbackGenerationRef.current !== generation) {
          return { activeLayers, superseded: true };
        }

        try {
          await optionsRef.current.syncLayers?.({
            activeLayers,
            timelineTime,
            reason,
          });
        } catch (syncError: unknown) {
          if (playbackGenerationRef.current !== generation) {
            return { activeLayers, superseded: true };
          }
          return { activeLayers, error: handleSyncFailure(syncError, generation) };
        }

        return playbackGenerationRef.current === generation
          ? { activeLayers }
          : { activeLayers, superseded: true };
      };

      const pendingSynchronization = synchronizationQueueRef.current.then(synchronize, synchronize);
      synchronizationQueueRef.current = pendingSynchronization.then(
        () => undefined,
        () => undefined
      );
      return pendingSynchronization;
    },
    [getActiveLayers, handleSyncFailure]
  );

  const pausePlayback = useCallback(() => {
    pause('paused');
    return timelineCommandOk();
  }, [pause]);

  const play = useCallback(async () => {
    if (engine.getState().playing) {
      return timelineCommandOk();
    }

    const generation = playbackGenerationRef.current + 1;
    playbackGenerationRef.current = generation;
    playbackStartGenerationRef.current = generation;
    synchronizationQueueRef.current = Promise.resolve();
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
    const synchronization = await synchronizeLayers(startTime, 'play', generation);
    const { activeLayers } = synchronization;
    if (synchronization.superseded === true) {
      return timelineCommandFail('policy-rejected', 'Playback start was superseded.');
    }
    if (synchronization.error !== undefined) {
      return timelineCommandFail(
        'sync-failed',
        'External media synchronization failed.',
        synchronization.error
      );
    }
    if (!activeLayers.hasActiveClips) {
      pause('content-gap');
      return timelineCommandFail('content-gap');
    }

    const started = engine.play({ ...playbackOptions, clock: 'external' });
    if (!started) {
      if (playbackStartGenerationRef.current === generation) {
        playbackStartGenerationRef.current = null;
      }
      return timelineCommandFail('unsupported');
    }

    if (playbackStartGenerationRef.current === generation) {
      playbackStartGenerationRef.current = null;
    }
    optionsRef.current.onStatus?.('playing');

    const tick = async () => {
      if (playbackGenerationRef.current !== generation) {
        return;
      }
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
          animationFrameRef.current = requestAnimationFrame(() => {
            void tick();
          });
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
      if (update.action === 'pause') {
        pause('paused');
        return;
      }
      const nextActiveLayers = getActiveLayers(update.time);
      if (update.action !== 'loop') {
        loopTransitionRef.current = null;
      } else if (loopTransitionRef.current === null) {
        const transition = {};
        loopTransitionRef.current = transition;
        try {
          await currentOptions.loop?.(update.time, nextActiveLayers);
        } catch {
          if (loopTransitionRef.current === transition) {
            pause('paused');
          }
          return;
        }
      }
      if (playbackGenerationRef.current !== generation) {
        return;
      }

      const synchronization = await synchronizeLayers(update.time, 'tick', generation);
      if (synchronization.superseded === true || synchronization.error !== undefined) {
        return;
      }
      if (!nextActiveLayers.hasActiveClips) {
        pause('content-gap');
        return;
      }

      if (playbackGenerationRef.current === generation) {
        animationFrameRef.current = requestAnimationFrame(() => {
          void tick();
        });
      }
    };

    animationFrameRef.current = requestAnimationFrame(() => {
      void tick();
    });
    return timelineCommandOk();
  }, [engine, getActiveLayers, pause, synchronizeLayers]);

  const setPlaybackRate = useCallback(
    async (rate: number) => {
      const previousRate = engine.getPlaybackRate();
      try {
        engine.setPlaybackRate(rate);
      } catch (rateError: unknown) {
        return timelineCommandInvalidInput(
          'Playback rate must be a positive finite number.',
          rateError
        );
      }

      try {
        optionsRef.current.setClockRate?.(rate);
      } catch (clockError: unknown) {
        engine.setPlaybackRate(previousRate);
        try {
          optionsRef.current.setClockRate?.(previousRate);
        } catch {
          // Preserve the original external-clock failure in the command result.
        }
        return timelineCommandFail(
          'sync-failed',
          'External media clock rate could not be updated.',
          toMediaError(clockError)
        );
      }

      const synchronization = await synchronizeLayers(
        engine.getTime(),
        'rate',
        playbackGenerationRef.current
      );
      if (synchronization.error !== undefined) {
        return timelineCommandFail(
          'sync-failed',
          'External media synchronization failed.',
          synchronization.error
        );
      }
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
      playbackGenerationRef.current += 1;
      playbackStartGenerationRef.current = null;
      synchronizationQueueRef.current = Promise.resolve();
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
