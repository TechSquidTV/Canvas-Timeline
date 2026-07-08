import type {
  ActiveLayerResult,
  ActiveLayerSelector,
  MaybePromise,
} from '@techsquidtv/canvas-timeline-core';
import { fromSeconds, type RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTimeline } from '#react/hooks/core/useTimeline';
import {
  timelineCommandFail,
  timelineCommandOk,
  type TimelineCommandResult,
} from '#react/hooks/core/timelineCommandResult';

/**
 * Reason an external media callback is being synchronized.
 */
export type TimelineMediaSyncReason = 'play' | 'tick' | 'rate' | 'gap' | 'pause';

/**
 * Status emitted by the timeline media playback hook.
 */
export type TimelineContentPlaybackStatus = 'idle' | 'playing' | 'paused' | 'content-gap';

/**
 * Details passed to external media sync callbacks.
 *
 * @remarks
 *
 * `TimelineLayerSyncDetails` is emitted when playback starts, ticks, pauses,
 * crosses a content gap, or changes rate. Adapter code should use `reason` to
 * decide whether work can be skipped. For example, an audio adapter usually
 * reschedules on `"play"` and `"rate"`, but can ignore ordinary `"tick"` calls
 * while the same clip remains active.
 *
 * @template LayerName - Named media layer keys from
 * {@link UseTimelineMediaPlaybackOptions.layers}.
 */
export interface TimelineLayerSyncDetails<LayerName extends string = string> {
  /** Timeline time being synchronized. */
  timelineTime: RationalTime;
  /** Reason the external layer callback is being synchronized. */
  reason: TimelineMediaSyncReason;
  /** Active clips grouped by the configured layer selectors. */
  activeLayers: ActiveLayerResult<LayerName>;
}

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
  /** Stops the external media clock when timeline playback pauses or leaves active content. */
  stopClock?: () => void;
  /** Named active layer selectors used by the external media surface. */
  layers: Record<LayerName, ActiveLayerSelector>;
  /** Synchronizes external rendering, audio, text, or effects for the active layers. */
  syncLayers?: (details: TimelineLayerSyncDetails<LayerName>) => MaybePromise<void>;
  /** Receives high-level playback status changes. */
  onStatus?: (status: TimelineContentPlaybackStatus) => void;
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
 * import { useTimelineMediaPlayback } from '#react/hooks';
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
    const startTime = engine.getTime();
    const activeLayers = synchronizeLayers(startTime, 'play');
    if (!activeLayers.hasActiveClips) {
      pause('content-gap');
      return timelineCommandFail('content-gap');
    }

    const started = engine.play({ clock: 'external' });
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
      const timelineTime = fromSeconds(currentOptions.getClockTime(), engine.getTime().r);
      engine.setTime(timelineTime);

      const nextActiveLayers = synchronizeLayers(timelineTime, 'tick');
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
