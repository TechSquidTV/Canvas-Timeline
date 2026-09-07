import type {
  ActiveLayerSelector,
  ActiveLayerResult,
  PlaybackOptions,
  TimelineMediaSyncAdapter,
} from '@techsquidtv/canvas-timeline-core';
import { TimelineMediaError } from '@techsquidtv/canvas-timeline-core';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useActiveLayers } from '#react/hooks/clips/useActiveLayers';
import { toMediaError, withMediaCauseMessage } from '#react/hooks/playback/mediaError';
import {
  MediaClockOwnership,
  startMediaClockPlayback,
} from '#react/hooks/playback/internal/mediaClockOwnership';
import {
  createMediaPlayFailure,
  type TimelineMediaPlayResult,
} from '#react/hooks/playback/internal/mediaPlayResult';
import { MediaSynchronizationQueue } from '#react/hooks/playback/internal/mediaSynchronizationQueue';
import { usePausedMediaPreviewSynchronization } from '#react/hooks/playback/internal/pausedMediaPreviewScheduler';
import type { UseTimelineMediaPlaybackOptions } from '#react/hooks/playback/useTimelineMediaPlayback';
import { useTimelineMediaPlaybackInternal } from '#react/hooks/playback/internal/useTimelineMediaPlaybackInternal';
import { useTimeline } from '#react/hooks/core/useTimeline';
import type { TimelineCommandResult } from '#react/hooks/core/timelineCommandResult';

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
export type { TimelineMediaPlayResult } from '#react/hooks/playback/internal/mediaPlayResult';

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
  const { engine } = useTimeline();
  const activeLayers = useActiveLayers<LayerName>({ layers });
  const adapterRef = useRef(adapter);
  const adapterIdentityRef = useRef(adapterIdentity);
  const readyRef = useRef(ready);
  const onErrorRef = useRef(onError);
  const [clockOwnership] = useState(
    () => new MediaClockOwnership<LayerName, TimelineMediaPlayResult>()
  );
  const clockOwnershipRef = useRef(clockOwnership);
  const [adapterOperationQueue] = useState(() => new MediaSynchronizationQueue());
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
    clockOwnershipRef.current.stopOwnedClock();
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
              } catch (syncError) {
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
          } catch (loopError) {
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

  useEffect(() => {
    const sameAdapterIdentity = Object.is(adapterIdentityRef.current, adapterIdentity);
    clockOwnershipRef.current.updateAdapter(adapter, sameAdapterIdentity);
    adapterRef.current = adapter;
    readyRef.current = ready;
    onErrorRef.current = onError;
  }, [adapter, adapterIdentity, layers, onError, ready, syncPlayback.playing]);

  useEffect(() => {
    clockOwnershipRef.current.clearOwnerWhenIdle(syncPlayback.playing);
  }, [syncPlayback.playing]);

  const hasPendingPlaybackStart = useCallback(() => clockOwnershipRef.current.pending !== null, []);
  const pausedPreview = usePausedMediaPreviewSynchronization({
    engine,
    adapter,
    adapterIdentity,
    layers,
    ready,
    playing: syncPlayback.playing,
    hasPendingPlaybackStart,
    operationQueue: adapterOperationQueue,
    onError,
  });
  const cancelScheduledSeek = pausedPreview.cancel;

  const cancelPendingPlaybackStart = useCallback(() => {
    return clockOwnershipRef.current.cancelPendingStart(invalidateAdapterOperations);
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
        clockOwnershipRef.current.clearOwner();
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
    pausedPreview.resetForAdapter(shouldPrimeAdapter);
    const cancelledPendingStart = cancelPendingPlaybackStart();
    const previousOwner = clockOwnershipRef.current.owner;
    if (previousOwner !== null) {
      if (cancelledPendingStart) {
        clockOwnershipRef.current.clearOwner();
      }
      pauseSynchronizedPlayback();
    }
  }, [
    adapter,
    adapterIdentity,
    cancelPendingPlaybackStart,
    invalidateAdapterOperations,
    pausedPreview,
    ready,
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
    (generation: number) =>
      startMediaClockPlayback({
        engine,
        generation,
        frameRate,
        layers,
        playbackOptions,
        ownership: clockOwnershipRef.current,
        operationQueue: adapterOperationQueue,
        getAdapter: () => adapterRef.current,
        getAdapterIdentity: () => adapterIdentityRef.current,
        isReady: () => readyRef.current,
        playTimeline: syncPlayback.play,
        onError: onErrorRef.current,
      }),
    [adapterOperationQueue, engine, frameRate, layers, playbackOptions, syncPlayback.play]
  );

  const play = useCallback((): Promise<TimelineMediaPlayResult> => {
    if (engine.getState().playing) {
      if (clockOwnershipRef.current.owner !== null) {
        return Promise.resolve({ ok: true, time: engine.getTime() });
      }
      return Promise.resolve(
        createMediaPlayFailure(
          'timeline-failed',
          'Timeline playback is already controlled by another clock.',
          onErrorRef.current
        )
      );
    }

    cancelScheduledSeek();
    return clockOwnershipRef.current.queueStart(adapter, startPlayback);
  }, [adapter, cancelScheduledSeek, engine, startPlayback]);

  const pause = useCallback(() => {
    invalidateAdapterOperations();
    const cancelledPendingStart = cancelPendingPlaybackStart();
    const result = syncPlayback.pause();
    if (!cancelledPendingStart) {
      clockOwnershipRef.current.clearOwner();
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
