import type {
  ActiveLayerSelector,
  PlaybackOptions,
  TimelineEngine,
  TimelineMediaError,
  TimelineMediaSyncAdapter,
} from '@techsquidtv/canvas-timeline-core';
import {
  compareRational,
  rationalEquals,
  type RationalTime,
  type TimecodeFrameRate,
} from '@techsquidtv/canvas-timeline-utils';
import { quantizeTimelineTimeToFrame } from '#react/hooks/playback/playbackFrameTime';
import { toMediaError, withMediaCauseMessage } from '#react/hooks/playback/mediaError';
import type { TimelineCommandResult } from '#react/hooks/core/timelineCommandResult';
import type { MediaSynchronizationQueue } from '#react/hooks/playback/internal/mediaSynchronizationQueue';
import {
  createCancelledMediaPlayResult,
  createMediaPlayFailure,
  type TimelineMediaPlayResult,
} from '#react/hooks/playback/internal/mediaPlayResult';

export interface PendingMediaPlaybackStart<LayerName extends string, PlayResult> {
  generation: number;
  adapter: TimelineMediaSyncAdapter<LayerName>;
  promise: Promise<PlayResult>;
}

export interface MediaClockOwner<LayerName extends string> {
  generation: number;
  adapter: TimelineMediaSyncAdapter<LayerName>;
  identity: object | undefined;
}

export class MediaClockOwnership<LayerName extends string, PlayResult> {
  private barrier: Promise<void> = Promise.resolve();
  private generation = 0;
  owner: MediaClockOwner<LayerName> | null = null;
  pending: PendingMediaPlaybackStart<LayerName, PlayResult> | null = null;

  updateAdapter(adapter: TimelineMediaSyncAdapter<LayerName>, sameIdentity: boolean) {
    if (!sameIdentity) {
      return;
    }
    if (this.owner !== null) {
      this.owner.adapter = adapter;
    }
    if (this.pending !== null) {
      this.pending.adapter = adapter;
    }
  }

  isCurrentStart(generation: number) {
    return this.pending?.generation === generation;
  }

  stopOwnedClock(generation?: number) {
    const owner = this.owner;
    if (owner === null || (generation !== undefined && owner.generation !== generation)) {
      return;
    }
    this.owner = null;
    owner.adapter.stopClock?.();
  }

  cancelPendingStart(invalidateOperations: () => void) {
    const pendingStart = this.pending;
    if (pendingStart === null) {
      return false;
    }
    this.generation += 1;
    invalidateOperations();
    this.pending = null;
    pendingStart.adapter.stopClock?.();
    return true;
  }

  queueStart(
    adapter: TimelineMediaSyncAdapter<LayerName>,
    start: (generation: number) => Promise<PlayResult>
  ) {
    if (this.pending !== null) {
      return this.pending.promise;
    }
    const generation = this.generation + 1;
    this.generation = generation;
    const promise = this.barrier.then(() => start(generation));
    this.barrier = promise.then(
      () => undefined,
      () => undefined
    );
    this.pending = { generation, adapter, promise };
    const clearPendingStart = () => {
      if (this.pending?.promise === promise) {
        this.pending = null;
      }
    };
    void promise.then(clearPendingStart, clearPendingStart);
    return promise;
  }

  clearOwnerWhenIdle(playing: boolean) {
    if (!playing && this.pending === null) {
      this.owner = null;
    }
  }

  clearOwner() {
    this.owner = null;
  }
}

type MediaClockStartupResult =
  | { state: 'cancelled' }
  | { state: 'competing-clock' }
  | { state: 'started'; started: boolean };

interface StartMediaClockPlaybackOptions<LayerName extends string> {
  engine: TimelineEngine;
  generation: number;
  frameRate: TimecodeFrameRate | undefined;
  layers: Record<LayerName, ActiveLayerSelector>;
  playbackOptions: Omit<PlaybackOptions, 'clock'> | undefined;
  ownership: MediaClockOwnership<LayerName, TimelineMediaPlayResult>;
  operationQueue: MediaSynchronizationQueue;
  getAdapter: () => TimelineMediaSyncAdapter<LayerName>;
  getAdapterIdentity: () => object | undefined;
  isReady: () => boolean;
  playTimeline: () => Promise<TimelineCommandResult>;
  onError: ((error: TimelineMediaError) => void) | undefined;
}

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

export async function startMediaClockPlayback<LayerName extends string>({
  engine,
  generation,
  frameRate,
  layers,
  playbackOptions,
  ownership,
  operationQueue,
  getAdapter,
  getAdapterIdentity,
  isReady,
  playTimeline,
  onError,
}: StartMediaClockPlaybackOptions<LayerName>): Promise<TimelineMediaPlayResult> {
  const operationToken = operationQueue.capture(getAdapterIdentity());
  const isCurrentOperation = () => operationQueue.isCurrent(operationToken, getAdapterIdentity());
  let startupAdapter = getAdapter();
  if (!ownership.isCurrentStart(generation)) {
    return createCancelledMediaPlayResult();
  }
  if (!isReady()) {
    return createMediaPlayFailure('not-ready', 'Media adapter is not ready.', onError);
  }
  if (engine.getState().playing) {
    if (ownership.owner !== null) {
      return { ok: true, time: engine.getTime() };
    }
    return createMediaPlayFailure(
      'timeline-failed',
      'Timeline playback is already controlled by another clock.',
      onError
    );
  }

  const currentTime = engine.getTime();
  const resolvedStartTime = engine.getPlaybackStartTime(playbackOptions);
  let timelineTime = quantizeTimelineTimeToFrame(resolvedStartTime, frameRate);
  if (!rationalEquals(currentTime, timelineTime)) {
    engine.setTime(timelineTime);
  }
  let timelineLayers = engine.getActiveLayers({ time: timelineTime, layers });

  if (!timelineLayers.hasActiveClips) {
    const state = engine.getState();
    const playbackStartTime = (playbackOptions?.respectInOut ?? true) ? state.inPoint : undefined;
    const playbackEndTime = getEarliestTimelineTime([
      playbackOptions?.toTime,
      state.duration,
      (playbackOptions?.respectInOut ?? true) ? state.outPoint : undefined,
    ]);
    const playbackStartsInContent =
      playbackStartTime !== undefined &&
      (playbackEndTime === undefined || compareRational(playbackStartTime, playbackEndTime) < 0) &&
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
        return createMediaPlayFailure('no-content', 'No timeline content is available.', onError);
      }
    } else {
      timelineTime = quantizeTimelineTimeToFrame(firstContentTime, frameRate, 'ceil');
      engine.setTime(timelineTime);
      timelineLayers = engine.getActiveLayers({ time: timelineTime, layers });
    }
  }

  if (!timelineLayers.hasActiveClips) {
    return createMediaPlayFailure(
      'no-active-content',
      'No active timeline content is available.',
      onError
    );
  }

  try {
    startupAdapter = getAdapter();
    startupAdapter.requestClockActivation?.(engine.getPlaybackRate());
    const clockStartup = await operationQueue.enqueue(
      async (): Promise<MediaClockStartupResult> => {
        if (!isCurrentOperation()) {
          return { state: 'cancelled' };
        }
        startupAdapter = getAdapter();
        await startupAdapter.seek?.(timelineTime, timelineLayers);
        if (!isCurrentOperation() || !ownership.isCurrentStart(generation) || !isReady()) {
          return { state: 'cancelled' };
        }
        if (engine.getState().playing) {
          startupAdapter = getAdapter();
          startupAdapter.stopClock?.();
          return { state: 'competing-clock' };
        }

        startupAdapter = getAdapter();
        ownership.owner = {
          generation,
          adapter: startupAdapter,
          identity: getAdapterIdentity(),
        };
        return {
          state: 'started',
          started: await startupAdapter.startClock(timelineTime, engine.getPlaybackRate()),
        };
      }
    );
    if (
      clockStartup.state === 'cancelled' ||
      !isCurrentOperation() ||
      !ownership.isCurrentStart(generation) ||
      !isReady()
    ) {
      ownership.stopOwnedClock(generation);
      return createCancelledMediaPlayResult();
    }
    if (clockStartup.state === 'competing-clock') {
      return createMediaPlayFailure(
        'timeline-failed',
        'Timeline playback is already controlled by another clock.',
        onError
      );
    }
    if (!clockStartup.started) {
      ownership.stopOwnedClock(generation);
      return createMediaPlayFailure('clock-failed', 'Media clock could not start.', onError);
    }
  } catch (clockError) {
    if (!isCurrentOperation() || !ownership.isCurrentStart(generation) || !isReady()) {
      ownership.stopOwnedClock(generation);
      return createCancelledMediaPlayResult();
    }
    if (ownership.owner?.generation === generation) {
      ownership.stopOwnedClock(generation);
    } else {
      startupAdapter.stopClock?.();
    }
    return createMediaPlayFailure(
      'clock-failed',
      'Media clock could not start.',
      onError,
      toMediaError(clockError)
    );
  }

  let timelineStarted = false;
  try {
    if (engine.getState().playing) {
      ownership.stopOwnedClock(generation);
      return createMediaPlayFailure(
        'timeline-failed',
        'Timeline playback is already controlled by another clock.',
        onError
      );
    }
    const timelineResult = await playTimeline();
    if (!timelineResult.ok && timelineResult.reason === 'sync-failed') {
      ownership.stopOwnedClock(generation);
      return {
        ok: false,
        reason: 'sync-failed',
        message: withMediaCauseMessage('Media synchronization failed.', timelineResult.cause),
        ...(timelineResult.cause !== undefined ? { cause: timelineResult.cause } : {}),
      };
    }
    if (!isCurrentOperation() || !ownership.isCurrentStart(generation) || !isReady()) {
      ownership.stopOwnedClock(generation);
      return createCancelledMediaPlayResult();
    }
    timelineStarted = timelineResult.ok;
  } catch (timelineError) {
    if (!isCurrentOperation() || !ownership.isCurrentStart(generation) || !isReady()) {
      ownership.stopOwnedClock(generation);
      return createCancelledMediaPlayResult();
    }
    ownership.stopOwnedClock(generation);
    return createMediaPlayFailure(
      'timeline-failed',
      'Timeline playback could not start.',
      onError,
      toMediaError(timelineError)
    );
  }

  if (!timelineStarted) {
    ownership.stopOwnedClock(generation);
    return createMediaPlayFailure('timeline-failed', 'Timeline playback could not start.', onError);
  }

  return { ok: true, time: timelineTime };
}
