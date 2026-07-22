import type {
  ActiveLayerSelector,
  ActiveLayerResult,
  PlaybackOptions,
  TimelineMediaPlayFailureReason,
  TimelineMediaSyncAdapter,
} from '@techsquidtv/canvas-timeline-core';
import { TimelineMediaError } from '@techsquidtv/canvas-timeline-core';
import {
  compareRational,
  rationalEquals,
  type RationalTime,
} from '@techsquidtv/canvas-timeline-utils';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useActiveLayers } from '#react/hooks/clips/useActiveLayers';
import { quantizeTimelineTimeToFrame } from '#react/hooks/playback/playbackFrameTime';
import { toMediaError, withMediaCauseMessage } from '#react/hooks/playback/mediaError';
import { MediaClockOwnership } from '#react/hooks/playback/internal/mediaClockOwnership';
import { MediaSynchronizationQueue } from '#react/hooks/playback/internal/mediaSynchronizationQueue';
import { PausedMediaPreviewScheduler } from '#react/hooks/playback/internal/pausedMediaPreviewScheduler';
import type { UseTimelineMediaPlaybackOptions } from '#react/hooks/playback/useTimelineMediaPlayback';
import { useTimelineMediaPlaybackInternal } from '#react/hooks/playback/internal/useTimelineMediaPlaybackInternal';
import { useTimeline } from '#react/hooks/core/useTimeline';
import type { TimelineCommandResult } from '#react/hooks/core/timelineCommandResult';

function getEarliestTimelineTime(
  times: readonly (RationalTime | undefined)[]
): RationalTime | undefined {
  return times.reduce<RationalTime | undefined>((earliest, time) => {
    if (time === undefined || (earliest !== undefined && compareRational(earliest, time) <= 0)) {
      return earliest;
    }
    return time;
  }, undefined);
}

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
  /** Whether the external adapter can accept a playback request for configured media. */
  ready?: boolean;
  /** Optional sequence frame rate used to lock media playback to project frames. */
  frameRate?: UseTimelineMediaPlaybackOptions<LayerName>['frameRate'];
  /** Core playback range and looping policy captured when each playback run begins. */
  playbackOptions?: Omit<PlaybackOptions, 'clock'>;
  /** Named active layer selectors used by the external media surface. */
  layers: Record<LayerName, ActiveLayerSelector>;
  /** External media adapter callbacks. */
  adapter: TimelineMediaSyncAdapter<LayerName>;
  /**
   * Stable identity for the adapter resource lifetime.
   *
   * @remarks
   *
   * Pass the underlying controller or element-backed adapter when replacing it
   * must cancel pending playback and release its clock. Omit this for an inline
   * callback facade whose object identity may change on every render.
   */
  adapterIdentity?: object;
  /** Receives structured media failures with a stable machine-readable reason. */
  onError?: (error: TimelineMediaError) => void;
}

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
      /** Discriminant for a failed media play command. */
      ok: false;
      /** Machine-readable play failure category. */
      reason: TimelineMediaPlayFailureReason;
      /** Human-readable failure detail suitable for status UI or logs. */
      message: string;
      /** Underlying adapter or decoder failure, when one was thrown. */
      cause?: Error;
    };

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
  /** Updates both clock rates and resolves after active layers resynchronize. */
  setPlaybackRate: (playbackRate: number) => Promise<TimelineCommandResult>;
}

type MediaClockStartupResult =
  | { state: 'cancelled' }
  | { state: 'competing-clock' }
  | { state: 'started'; started: boolean };

function createPlayFailure(
  reason: TimelineMediaPlayFailureReason,
  message: string,
  onError: UseTimelineMediaSyncOptions['onError'],
  cause?: Error
): TimelineMediaPlayResult {
  const error = new TimelineMediaError(reason, withMediaCauseMessage(message, cause), { cause });
  const result = {
    ok: false,
    reason,
    message: error.message,
    ...(cause !== undefined ? { cause } : {}),
  } as const;
  onError?.(error);
  return result;
}

function createCancelledPlayResult(): TimelineMediaPlayResult {
  return {
    ok: false,
    reason: 'cancelled',
    message: 'Media playback start was cancelled.',
  };
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
 * High-level `playbackOptions.loop` is translated into an adapter seek and clock
 * restart at the range start. Errors are delivered as {@link TimelineMediaError}
 * values and play commands also return a discriminated result.
 * Paused previews, startup, loop realignment, layer synchronization, and rate
 * changes share one ordered adapter-operation queue so older asynchronous media
 * work cannot overwrite a newer timeline position.
 * Replacing the adapter cancels an in-flight start, stops a clock owned by the
 * previous adapter, pauses timeline transport, and primes the replacement for
 * the current paused preview position.
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
  const {
    adapter,
    adapterIdentity,
    frameRate,
    layers,
    onError,
    playbackOptions,
    ready = true,
  } = options;
  const adapterCanSeek = adapter.seek !== undefined;
  const { engine } = useTimeline();
  const activeLayers = useActiveLayers<LayerName>({ layers });
  const adapterRef = useRef(adapter);
  const adapterIdentityRef = useRef(adapterIdentity);
  const layersRef = useRef(layers);
  const pausedPreviewPrimedRef = useRef(false);
  const previewSchedulerRef = useRef<PausedMediaPreviewScheduler | null>(null);
  previewSchedulerRef.current ??= new PausedMediaPreviewScheduler();
  const previewScheduler = previewSchedulerRef.current;
  const readyRef = useRef(ready);
  const onErrorRef = useRef(onError);
  const playbackStartGenerationRef = useRef(0);
  const clockOwnershipRef = useRef(new MediaClockOwnership<LayerName, TimelineMediaPlayResult>());
  const adapterOperationQueueRef = useRef<MediaSynchronizationQueue | null>(null);
  adapterOperationQueueRef.current ??= new MediaSynchronizationQueue();
  const adapterOperationQueue = adapterOperationQueueRef.current;
  const { loop: shouldLoop = false, ...externalPlaybackOptions } = playbackOptions ?? {};

  const captureAdapterOperation = useCallback(
    () => adapterOperationQueue.capture(adapterIdentityRef.current),
    [adapterOperationQueue]
  );

  const isCurrentAdapterOperation = useCallback(
    (token: ReturnType<MediaSynchronizationQueue['capture']>) =>
      adapterOperationQueue.isCurrent(token, adapterIdentityRef.current),
    [adapterOperationQueue]
  );

  const invalidateAdapterOperations = useCallback(() => {
    adapterOperationQueue.invalidate();
  }, [adapterOperationQueue]);

  const enqueueAdapterOperation = useCallback(
    <Result>(operation: () => Promise<Result>) => adapterOperationQueue.enqueue(operation),
    [adapterOperationQueue]
  );

  const synchronizationRunner = useMemo(
    () => ({
      run: <Result>(operation: () => Promise<Result>, superseded: () => Result) => {
        return adapterOperationQueue.run(() => adapterIdentityRef.current, operation, superseded);
      },
    }),
    [adapterOperationQueue]
  );

  const stopSynchronizedClock = useCallback(() => {
    const owner = clockOwnershipRef.current.owner;
    clockOwnershipRef.current.owner = null;
    owner?.adapter.stopClock?.();
  }, []);

  const adapterSyncLayers = adapter.syncLayers;

  const syncPlaybackOptions: UseTimelineMediaPlaybackOptions<LayerName> = {
    frameRate,
    playbackOptions: externalPlaybackOptions,
    getClockTime: adapter.getClockTime,
    stopClock: stopSynchronizedClock,
    setClockRate: adapter.setClockRate,
    layers,
    syncLayers:
      adapterSyncLayers === undefined
        ? undefined
        : (details) => {
            const token = captureAdapterOperation();
            const synchronize = async () => {
              if (!isCurrentAdapterOperation(token)) {
                return;
              }
              try {
                await adapterRef.current.syncLayers?.(details);
              } catch (syncError: unknown) {
                if (!isCurrentAdapterOperation(token)) {
                  return;
                }
                throw syncError;
              }
              if (!isCurrentAdapterOperation(token)) {
                return;
              }
            };
            return synchronize();
          },
    onStatus: adapter.onStatus,
    onError: (syncError) => {
      onErrorRef.current?.(
        syncError instanceof TimelineMediaError
          ? syncError
          : new TimelineMediaError(
              'sync-failed',
              withMediaCauseMessage('Media synchronization failed.', syncError),
              { cause: syncError }
            )
      );
    },
    ...(shouldLoop && {
      loop: (timelineTime: RationalTime, loopLayers: ActiveLayerResult<LayerName>) => {
        const loopOwner = clockOwnershipRef.current.owner;
        if (loopOwner === null) {
          return;
        }
        const token = captureAdapterOperation();
        return enqueueAdapterOperation(async () => {
          const stillOwnsClock = () =>
            isCurrentAdapterOperation(token) &&
            clockOwnershipRef.current.owner === loopOwner &&
            engine.getState().playing;
          if (!stillOwnsClock()) {
            return;
          }

          let restarted: boolean;
          try {
            await loopOwner.adapter.seek?.(timelineTime, loopLayers);
            if (!stillOwnsClock()) {
              return;
            }
            restarted = await loopOwner.adapter.startClock(timelineTime, engine.getPlaybackRate());
          } catch (loopError: unknown) {
            if (!stillOwnsClock()) {
              return;
            }
            const cause = toMediaError(loopError);
            const error = new TimelineMediaError(
              'loop-failed',
              withMediaCauseMessage('Media clock could not restart after looping.', cause),
              { cause }
            );
            throw error;
          }
          if (!stillOwnsClock()) {
            loopOwner.adapter.stopClock?.();
            return;
          }
          if (!restarted) {
            const error = new TimelineMediaError(
              'loop-failed',
              'Media clock could not restart after looping.'
            );
            throw error;
          }
        });
      },
    }),
  };
  const syncPlayback = useTimelineMediaPlaybackInternal(syncPlaybackOptions, synchronizationRunner);
  const pauseSynchronizedPlayback = syncPlayback.pause;
  const playingRef = useRef(syncPlayback.playing);

  useEffect(() => {
    const sameAdapterIdentity = Object.is(adapterIdentityRef.current, adapterIdentity);
    const owner = clockOwnershipRef.current.owner;
    if (owner !== null && sameAdapterIdentity) {
      owner.adapter = adapter;
    }
    const pendingStart = clockOwnershipRef.current.pending;
    if (pendingStart !== null && sameAdapterIdentity) {
      pendingStart.adapter = adapter;
    }
    adapterRef.current = adapter;
    layersRef.current = layers;
    playingRef.current = syncPlayback.playing;
    readyRef.current = ready;
    onErrorRef.current = onError;
  }, [adapter, adapterIdentity, layers, onError, ready, syncPlayback.playing]);

  useEffect(() => {
    if (!syncPlayback.playing && clockOwnershipRef.current.pending === null) {
      clockOwnershipRef.current.owner = null;
    }
  }, [syncPlayback.playing]);

  const cancelScheduledSeek = useCallback(() => {
    previewScheduler.cancel();
  }, [previewScheduler]);

  const canSeekPausedPreview = useCallback(
    () =>
      clockOwnershipRef.current.pending === null &&
      readyRef.current &&
      !playingRef.current &&
      adapterRef.current.seek !== undefined,
    []
  );

  const schedulePausedPreviewSeek = useCallback(() => {
    if (!canSeekPausedPreview()) {
      return;
    }
    previewScheduler.schedule((generation) => {
      if (!canSeekPausedPreview()) {
        return;
      }

      const timelineTime = engine.getTime();
      const currentActiveLayers = engine.getActiveLayers({
        time: timelineTime,
        layers: layersRef.current,
      });
      const operationToken = adapterOperationQueue.capture(adapterIdentityRef.current);
      void enqueueAdapterOperation(async () => {
        if (
          !previewScheduler.isCurrent(generation) ||
          !adapterOperationQueue.isCurrent(operationToken, adapterIdentityRef.current) ||
          !canSeekPausedPreview()
        ) {
          return;
        }
        const currentAdapter = adapterRef.current;
        try {
          await currentAdapter.seek?.(timelineTime, currentActiveLayers);
        } catch (seekError: unknown) {
          if (
            !previewScheduler.isCurrent(generation) ||
            !adapterOperationQueue.isCurrent(operationToken, adapterIdentityRef.current) ||
            !canSeekPausedPreview()
          ) {
            return;
          }
          const cause = toMediaError(seekError);
          onErrorRef.current?.(
            new TimelineMediaError(
              'seek-failed',
              withMediaCauseMessage('Media seek failed.', cause),
              {
                cause,
              }
            )
          );
        }
      });
    });
  }, [
    canSeekPausedPreview,
    adapterOperationQueue,
    engine,
    enqueueAdapterOperation,
    previewScheduler,
  ]);

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
    if (!ready || !adapterCanSeek) {
      pausedPreviewPrimedRef.current = false;
      return;
    }

    if (pausedPreviewPrimedRef.current) {
      return;
    }

    pausedPreviewPrimedRef.current = true;
    schedulePausedPreviewSeek();
  }, [adapterCanSeek, ready, schedulePausedPreviewSeek]);

  const isCurrentPlaybackStart = useCallback((generation: number) => {
    return clockOwnershipRef.current.pending?.generation === generation;
  }, []);

  const stopOwnedClock = useCallback((generation: number) => {
    const owner = clockOwnershipRef.current.owner;
    if (owner?.generation !== generation) {
      return;
    }

    clockOwnershipRef.current.owner = null;
    owner.adapter.stopClock?.();
  }, []);

  const cancelPendingPlaybackStart = useCallback(() => {
    const pendingStart = clockOwnershipRef.current.pending;
    if (pendingStart === null) {
      return false;
    }

    playbackStartGenerationRef.current += 1;
    invalidateAdapterOperations();
    clockOwnershipRef.current.pending = null;
    pendingStart.adapter.stopClock?.();
    return true;
  }, [invalidateAdapterOperations]);

  useEffect(() => {
    if (ready) {
      return;
    }

    invalidateAdapterOperations();
    cancelScheduledSeek();
    const cancelledPendingStart = cancelPendingPlaybackStart();
    if (clockOwnershipRef.current.owner !== null) {
      if (cancelledPendingStart) {
        clockOwnershipRef.current.owner = null;
      }
      pauseSynchronizedPlayback();
    }
  }, [
    cancelPendingPlaybackStart,
    cancelScheduledSeek,
    invalidateAdapterOperations,
    pauseSynchronizedPlayback,
    ready,
  ]);

  useEffect(() => {
    if (Object.is(adapterIdentityRef.current, adapterIdentity)) {
      return;
    }

    adapterIdentityRef.current = adapterIdentity;
    invalidateAdapterOperations();
    const shouldPrimeAdapter = ready && adapter.seek !== undefined;
    pausedPreviewPrimedRef.current = shouldPrimeAdapter;
    cancelScheduledSeek();
    const cancelledPendingStart = cancelPendingPlaybackStart();
    const previousOwner = clockOwnershipRef.current.owner;
    if (previousOwner !== null) {
      if (cancelledPendingStart) {
        clockOwnershipRef.current.owner = null;
      }
      pauseSynchronizedPlayback();
    }
    if (shouldPrimeAdapter && !engine.getState().playing) {
      schedulePausedPreviewSeek();
    }
  }, [
    adapter,
    adapterIdentity,
    cancelPendingPlaybackStart,
    cancelScheduledSeek,
    engine,
    invalidateAdapterOperations,
    ready,
    schedulePausedPreviewSeek,
    pauseSynchronizedPlayback,
  ]);

  useEffect(
    () => () => {
      invalidateAdapterOperations();
      cancelPendingPlaybackStart();
    },
    [cancelPendingPlaybackStart, invalidateAdapterOperations]
  );

  const startPlayback = useCallback(
    async (generation: number): Promise<TimelineMediaPlayResult> => {
      const operationToken = captureAdapterOperation();
      let startupAdapter = adapterRef.current;
      if (!isCurrentPlaybackStart(generation)) {
        return createCancelledPlayResult();
      }
      if (!readyRef.current) {
        return createPlayFailure('not-ready', 'Media adapter is not ready.', onErrorRef.current);
      }
      if (engine.getState().playing) {
        if (clockOwnershipRef.current.owner !== null) {
          return { ok: true, time: engine.getTime() };
        }
        return createPlayFailure(
          'timeline-failed',
          'Timeline playback is already controlled by another clock.',
          onErrorRef.current
        );
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
        const state = engine.getState();
        const playbackStartTime =
          (playbackOptions?.respectInOut ?? true) ? state.inPoint : undefined;
        const playbackEndTime = getEarliestTimelineTime([
          playbackOptions?.toTime,
          state.duration,
          (playbackOptions?.respectInOut ?? true) ? state.outPoint : undefined,
        ]);
        const playbackStartsInContent =
          playbackStartTime !== undefined &&
          (playbackEndTime === undefined ||
            compareRational(playbackStartTime, playbackEndTime) < 0) &&
          engine.getActiveLayers({ time: playbackStartTime, layers }).hasActiveClips;
        const firstContentTime = playbackStartsInContent
          ? playbackStartTime
          : engine.getFirstContentTime({
              layers,
              atOrAfter: playbackStartTime,
              before: playbackEndTime,
            });
        if (firstContentTime === undefined) {
          if (engine.getFirstContentTime({ layers }) === undefined) {
            return createPlayFailure(
              'no-content',
              'No timeline content is available.',
              onErrorRef.current
            );
          }
        } else {
          timelineTime = quantizeTimelineTimeToFrame(firstContentTime, frameRate, 'ceil');
          engine.setTime(timelineTime);
          timelineLayers = engine.getActiveLayers({
            time: timelineTime,
            layers,
          });
        }
      }

      if (!timelineLayers.hasActiveClips) {
        return createPlayFailure(
          'no-active-content',
          'No active timeline content is available.',
          onErrorRef.current
        );
      }

      try {
        startupAdapter = adapterRef.current;
        startupAdapter.requestClockActivation?.(engine.getPlaybackRate());
        const clockStartup = await enqueueAdapterOperation(
          async (): Promise<MediaClockStartupResult> => {
            if (!isCurrentAdapterOperation(operationToken)) {
              return { state: 'cancelled' };
            }
            startupAdapter = adapterRef.current;
            await startupAdapter.seek?.(timelineTime, timelineLayers);
            if (
              !isCurrentAdapterOperation(operationToken) ||
              !isCurrentPlaybackStart(generation) ||
              !readyRef.current
            ) {
              return { state: 'cancelled' };
            }
            if (engine.getState().playing) {
              startupAdapter = adapterRef.current;
              startupAdapter.stopClock?.();
              return { state: 'competing-clock' };
            }

            startupAdapter = adapterRef.current;
            clockOwnershipRef.current.owner = {
              generation,
              adapter: startupAdapter,
              identity: adapterIdentityRef.current,
            };
            return {
              state: 'started',
              started: await startupAdapter.startClock(timelineTime, engine.getPlaybackRate()),
            };
          }
        );
        if (
          clockStartup.state === 'cancelled' ||
          !isCurrentAdapterOperation(operationToken) ||
          !isCurrentPlaybackStart(generation) ||
          !readyRef.current
        ) {
          stopOwnedClock(generation);
          return createCancelledPlayResult();
        }
        if (clockStartup.state === 'competing-clock') {
          return createPlayFailure(
            'timeline-failed',
            'Timeline playback is already controlled by another clock.',
            onErrorRef.current
          );
        }
        if (!clockStartup.started) {
          stopOwnedClock(generation);
          return createPlayFailure(
            'clock-failed',
            'Media clock could not start.',
            onErrorRef.current
          );
        }
      } catch (clockError: unknown) {
        if (
          !isCurrentAdapterOperation(operationToken) ||
          !isCurrentPlaybackStart(generation) ||
          !readyRef.current
        ) {
          stopOwnedClock(generation);
          return createCancelledPlayResult();
        }
        if (clockOwnershipRef.current.owner?.generation === generation) {
          stopOwnedClock(generation);
        } else {
          startupAdapter.stopClock?.();
        }
        return createPlayFailure(
          'clock-failed',
          'Media clock could not start.',
          onErrorRef.current,
          toMediaError(clockError)
        );
      }

      let timelineStarted = false;
      try {
        if (engine.getState().playing) {
          stopOwnedClock(generation);
          return createPlayFailure(
            'timeline-failed',
            'Timeline playback is already controlled by another clock.',
            onErrorRef.current
          );
        }
        const timelineResult = await syncPlayback.play();
        if (!timelineResult.ok && timelineResult.reason === 'sync-failed') {
          stopOwnedClock(generation);
          return {
            ok: false,
            reason: 'sync-failed',
            message: withMediaCauseMessage('Media synchronization failed.', timelineResult.cause),
            ...(timelineResult.cause !== undefined ? { cause: timelineResult.cause } : {}),
          };
        }
        if (
          !isCurrentAdapterOperation(operationToken) ||
          !isCurrentPlaybackStart(generation) ||
          !readyRef.current
        ) {
          stopOwnedClock(generation);
          return createCancelledPlayResult();
        }
        timelineStarted = timelineResult.ok;
      } catch (timelineError: unknown) {
        if (
          !isCurrentAdapterOperation(operationToken) ||
          !isCurrentPlaybackStart(generation) ||
          !readyRef.current
        ) {
          stopOwnedClock(generation);
          return createCancelledPlayResult();
        }
        stopOwnedClock(generation);
        return createPlayFailure(
          'timeline-failed',
          'Timeline playback could not start.',
          onErrorRef.current,
          toMediaError(timelineError)
        );
      }

      if (!timelineStarted) {
        stopOwnedClock(generation);
        return createPlayFailure(
          'timeline-failed',
          'Timeline playback could not start.',
          onErrorRef.current
        );
      }

      return { ok: true, time: timelineTime };
    },
    [
      engine,
      enqueueAdapterOperation,
      frameRate,
      captureAdapterOperation,
      isCurrentAdapterOperation,
      isCurrentPlaybackStart,
      layers,
      playbackOptions,
      stopOwnedClock,
      syncPlayback,
    ]
  );

  const play = useCallback((): Promise<TimelineMediaPlayResult> => {
    if (engine.getState().playing) {
      if (clockOwnershipRef.current.owner !== null) {
        return Promise.resolve({ ok: true, time: engine.getTime() });
      }
      return Promise.resolve(
        createPlayFailure(
          'timeline-failed',
          'Timeline playback is already controlled by another clock.',
          onErrorRef.current
        )
      );
    }

    const pendingStart = clockOwnershipRef.current.pending;
    if (pendingStart !== null) {
      return pendingStart.promise;
    }

    cancelScheduledSeek();
    const generation = playbackStartGenerationRef.current + 1;
    playbackStartGenerationRef.current = generation;
    const promise = clockOwnershipRef.current.barrier.then(() => startPlayback(generation));
    clockOwnershipRef.current.barrier = promise.then(
      () => {},
      () => {}
    );
    clockOwnershipRef.current.pending = { generation, adapter, promise };

    const clearPendingStart = () => {
      if (clockOwnershipRef.current.pending?.promise === promise) {
        clockOwnershipRef.current.pending = null;
      }
    };
    void promise.then(clearPendingStart, clearPendingStart);
    return promise;
  }, [adapter, cancelScheduledSeek, engine, startPlayback]);

  const pause = useCallback(() => {
    invalidateAdapterOperations();
    const cancelledPendingStart = cancelPendingPlaybackStart();
    const result = syncPlayback.pause();
    if (!cancelledPendingStart) {
      clockOwnershipRef.current.owner = null;
    }
    return result;
  }, [cancelPendingPlaybackStart, invalidateAdapterOperations, syncPlayback]);

  const setPlaybackRate = useCallback(
    (playbackRate: number) => syncPlayback.setPlaybackRate(playbackRate),
    [syncPlayback]
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
      pause,
      /** Updates both the external clock rate and the timeline playback rate. */
      setPlaybackRate,
    }),
    [activeLayers, pause, play, setPlaybackRate, syncPlayback.playing, syncPlayback.playbackRate]
  );
}
