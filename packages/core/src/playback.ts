import type { TimelineEngine } from '#core/engine';
import type { PlaybackClockSource, PlaybackOptions } from '#core/types';
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
    state.playing = true;

    const respectInOut = options.respectInOut ?? true;
    const loopRange = options.loop ?? false;

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
      let nextTime = addRational(currentState.playheadTime, deltaRt);

      // 1. Check respectInOut boundaries (In/Out points)
      if (respectInOut) {
        const inLimit = currentState.inPoint ?? fromSeconds(0, currentState.playheadTime.r);
        const outLimit = currentState.outPoint;

        if (outLimit !== undefined && compareRational(nextTime, outLimit) >= 0) {
          if (loopRange) {
            nextTime = inLimit;
          } else {
            this.engine.updatePlayhead(outLimit);
            this.pause();
            return;
          }
        }
      }

      // 2. Check total duration boundaries
      if (
        currentState.duration !== undefined &&
        compareRational(nextTime, currentState.duration) >= 0
      ) {
        if (loopRange) {
          nextTime = currentState.inPoint ?? fromSeconds(0, currentState.playheadTime.r);
        } else {
          this.engine.updatePlayhead(currentState.duration);
          this.pause();
          return;
        }
      }

      // 3. Check target time (from options)
      if (
        this.playbackTargetTime !== undefined &&
        compareRational(nextTime, this.playbackTargetTime) >= 0
      ) {
        this.engine.updatePlayhead(this.playbackTargetTime);
        if (this.playbackAutoEnd) {
          this.pause();
          return;
        }
      } else {
        this.engine.updatePlayhead(nextTime);
      }

      this.playbackInterval = requestAnimationFrame(loop);
    };

    this.playbackInterval = requestAnimationFrame(loop);
    this.engine.emit('playback:state', true);
    return true;
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
