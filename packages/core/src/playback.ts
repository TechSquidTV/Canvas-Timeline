import type { TimelineEngine } from '#core/engine';
import type { ExternalPlaybackUpdate, PlaybackClockSource, PlaybackOptions } from '#core/types';
import {
  addRational,
  compareRational,
  fromSeconds,
  type RationalTime,
} from '@techsquidtv/canvas-timeline-utils';

export class PlaybackManager {
  private engine: TimelineEngine;
  private playbackInterval: number | null = null;
  private lastFrameTime: number = 0;
  private playbackClockSource: PlaybackClockSource = 'internal';
  private playbackTargetTime: RationalTime | undefined;
  private playbackAutoEnd = false;
  private respectInOut = true;
  private loopRange = false;

  constructor(engine: TimelineEngine) {
    this.engine = engine;
  }

  play(options: PlaybackOptions = {}): boolean {
    const state = this.engine.getState();
    if (state.playing) {
      return false;
    }

    this.playbackClockSource = options.clock ?? 'internal';
    this.playbackAutoEnd = options.autoEnd ?? options.toTime !== undefined;
    this.playbackTargetTime =
      options.toTime ?? (options.autoEnd ? this.engine.maxContentTime : undefined);
    this.respectInOut = options.respectInOut ?? true;
    this.loopRange = options.loop ?? false;
    state.playing = true;

    if (this.playbackClockSource === 'external') {
      if (this.playbackInterval !== null) {
        cancelAnimationFrame(this.playbackInterval);
        this.playbackInterval = null;
      }
      this.engine.emit('playback:state', true);
      return true;
    }

    this.lastFrameTime = performance.now();

    const loop = (time: number) => {
      const currentState = this.engine.getState();
      if (!currentState.playing) {
        return;
      }
      const deltaMs = time - this.lastFrameTime;
      this.lastFrameTime = time;

      const deltaSec = (deltaMs / 1000) * (currentState.playbackRate ?? 1.0);
      const deltaRt = fromSeconds(deltaSec, currentState.playheadTime.r);
      const nextTime = addRational(currentState.playheadTime, deltaRt);
      const update = this.advanceTo(nextTime);
      if (update.action === 'pause') {
        return;
      }

      this.playbackInterval = requestAnimationFrame(loop);
    };

    this.playbackInterval = requestAnimationFrame(loop);
    this.engine.emit('playback:state', true);
    return true;
  }

  prepareStart(options: PlaybackOptions = {}): RationalTime {
    const state = this.engine.getState();
    const respectInOut = options.respectInOut ?? true;
    const rangeStart =
      respectInOut && state.inPoint !== undefined
        ? state.inPoint
        : fromSeconds(0, state.playheadTime.r);
    if (respectInOut && state.outPoint !== undefined) {
      if (compareRational(state.playheadTime, state.outPoint) >= 0) {
        return rangeStart;
      }
    }
    if (
      options.loop === true &&
      state.duration !== undefined &&
      compareRational(state.playheadTime, state.duration) >= 0
    ) {
      return rangeStart;
    }
    return state.playheadTime;
  }

  updateExternalTime(time: RationalTime): ExternalPlaybackUpdate {
    if (this.playbackClockSource !== 'external' || !this.engine.getState().playing) {
      this.engine.updatePlayhead(time);
      return { time: this.engine.getTime(), action: 'continue' };
    }
    return this.advanceTo(time);
  }

  private advanceTo(nextTime: RationalTime): ExternalPlaybackUpdate {
    const state = this.engine.getState();
    const timelineStart = fromSeconds(0, nextTime.r);
    const inLimit = this.respectInOut ? (state.inPoint ?? timelineStart) : timelineStart;

    let boundaryTime: RationalTime | undefined;
    let boundaryReason: NonNullable<ExternalPlaybackUpdate['reason']> | undefined;
    const considerBoundary = (
      time: RationalTime | undefined,
      reason: NonNullable<ExternalPlaybackUpdate['reason']>
    ) => {
      if (
        time === undefined ||
        compareRational(nextTime, time) < 0 ||
        (boundaryTime !== undefined && compareRational(time, boundaryTime) >= 0)
      ) {
        return;
      }
      boundaryTime = time;
      boundaryReason = reason;
    };

    if (this.respectInOut) {
      considerBoundary(state.outPoint, 'in-out');
    }
    considerBoundary(state.duration, 'duration');
    considerBoundary(this.playbackTargetTime, 'target');

    if (boundaryTime !== undefined && boundaryReason !== undefined) {
      if (boundaryReason !== 'target' && this.loopRange) {
        this.engine.updatePlayhead(inLimit);
        return { time: this.engine.getTime(), action: 'loop', reason: boundaryReason };
      }

      this.engine.updatePlayhead(boundaryTime);
      const time = this.engine.getTime();
      if (boundaryReason !== 'target' || this.playbackAutoEnd) {
        this.pause();
        return { time, action: 'pause', reason: boundaryReason };
      }
      return { time, action: 'continue' };
    }

    this.engine.updatePlayhead(nextTime);
    return { time: this.engine.getTime(), action: 'continue' };
  }

  pause() {
    const state = this.engine.getState();
    if (!state.playing && this.playbackInterval === null) {
      return;
    }
    state.playing = false;
    if (this.playbackInterval !== null) {
      cancelAnimationFrame(this.playbackInterval);
      this.playbackInterval = null;
    }
    this.playbackClockSource = 'internal';
    this.playbackTargetTime = undefined;
    this.playbackAutoEnd = false;
    this.respectInOut = true;
    this.loopRange = false;
    this.engine.emit('playback:state', false);
  }

  setPlaybackRate(rate: number) {
    const state = this.engine.getState();
    state.playbackRate = rate;
    this.engine.emit('playback:rate', rate);
  }

  getPlaybackRate() {
    const state = this.engine.getState();
    return state.playbackRate ?? 1.0;
  }

  destroy() {
    if (this.playbackInterval !== null) {
      cancelAnimationFrame(this.playbackInterval);
      this.playbackInterval = null;
    }
  }
}
