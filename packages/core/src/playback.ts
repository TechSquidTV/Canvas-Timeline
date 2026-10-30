import type { TimelineEngine } from '#core/engine';
import { cloneRationalTime } from '#core/model-clone';
import type {
  ExternalPlaybackUpdate,
  PlaybackClockSource,
  PlaybackOptions,
  TimelineState,
} from '#core/types';
import {
  addRational,
  compareRational,
  fromSeconds,
  toSeconds,
} from '@techsquidtv/canvas-timeline-utils';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
export class PlaybackManager {
  private engine: TimelineEngine;
  private playbackInterval: number | null = null;
  private lastFrameTime: number = 0;
  private playbackClockSource: PlaybackClockSource = 'internal';
  private playbackTargetTime: RationalTime | undefined;
  private playbackAutoEnd = false;
  private respectInOut = true;
  private loopRange = false;
  private contentEndCache: { revision: number; value: RationalTime } | null = null;

  constructor(
    engine: TimelineEngine,
    private state: TimelineState
  ) {
    this.engine = engine;
  }

  play(options: PlaybackOptions = {}): boolean {
    const state = this.state;
    if (state.playing) {
      return false;
    }

    this.playbackClockSource = options.clock ?? 'internal';
    this.playbackAutoEnd = options.autoEnd ?? options.toTime !== undefined;
    // Only explicit toTime targets are captured; implicit autoEnd ends resolve to the
    // live duration/content-end boundary so content edits stay coherent during playback.
    this.playbackTargetTime = options.toTime;
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
    let lastPlayheadTime = state.playheadTime;
    let remainderSeconds = 0;

    const loop = (time: number) => {
      const currentState = this.state;
      if (!currentState.playing) {
        return;
      }
      const deltaMs = time - this.lastFrameTime;
      this.lastFrameTime = time;

      // Keep sub-tick time across frames, but discard it after an explicit seek.
      if (currentState.playheadTime !== lastPlayheadTime) {
        remainderSeconds = 0;
      }
      const deltaSec = (deltaMs / 1000) * (currentState.playbackRate ?? 1.0) + remainderSeconds;
      const deltaRt = fromSeconds(deltaSec, currentState.playheadTime.r);
      remainderSeconds = deltaSec - toSeconds(deltaRt);
      const nextTime = addRational(currentState.playheadTime, deltaRt);
      const update = this.advanceTo(nextTime);
      lastPlayheadTime = currentState.playheadTime;
      if (update.action === 'loop' || compareRational(update.time, nextTime) !== 0) {
        remainderSeconds = 0;
      }
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
    const state = this.state;
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
    if (options.loop === true) {
      const loopEnd = state.duration !== undefined ? state.duration : this.resolveContentEnd();
      if (compareRational(state.playheadTime, loopEnd) >= 0) {
        return rangeStart;
      }
    }
    return state.playheadTime;
  }

  updateExternalTime(time: RationalTime): ExternalPlaybackUpdate {
    if (this.playbackClockSource !== 'external' || !this.state.playing) {
      this.engine.updatePlayhead(time);
      return { time: this.engine.getTime(), action: 'continue' };
    }
    return this.advanceTo(time);
  }

  /**
   * Content end used as the playback boundary when no explicit duration is set.
   * Cached per content revision because `maxContentTime` walks every clip.
   */
  private resolveContentEnd(): RationalTime {
    const revision = this.engine.contentRevision;
    const cached = this.contentEndCache;
    if (cached && cached.revision === revision) {
      return cached.value;
    }
    const value = cloneRationalTime(this.engine.maxContentTime);
    this.contentEndCache = { revision, value };
    return value;
  }

  private advanceTo(nextTime: RationalTime): ExternalPlaybackUpdate {
    const state = this.state;
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
    if (this.playbackAutoEnd) {
      considerBoundary(
        this.playbackTargetTime ??
          (state.duration !== undefined ? state.duration : this.resolveContentEnd()),
        'target'
      );
    }
    if (state.duration !== undefined) {
      considerBoundary(state.duration, 'duration');
    } else {
      const contentEnd = this.resolveContentEnd();
      if (compareRational(contentEnd, timelineStart) > 0) {
        considerBoundary(contentEnd, 'duration');
      } else {
        // Empty timeline: nothing to play, so pause instead of looping or pinning at
        // zero, regardless of whether the playback clock has advanced past zero.
        this.pause();
        return { time: this.engine.getTime(), action: 'pause', reason: 'duration' };
      }
    }
    considerBoundary(this.playbackTargetTime, 'target');

    if (boundaryTime !== undefined && boundaryReason !== undefined) {
      if (
        boundaryReason !== 'target' &&
        this.loopRange &&
        compareRational(inLimit, boundaryTime) < 0
      ) {
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
    const state = this.state;
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
    const state = this.state;
    state.playbackRate = rate;
    this.engine.emit('playback:rate', rate);
  }

  getPlaybackRate() {
    const state = this.state;
    return state.playbackRate ?? 1.0;
  }

  destroy() {
    if (this.playbackInterval !== null) {
      cancelAnimationFrame(this.playbackInterval);
      this.playbackInterval = null;
    }
  }
}
