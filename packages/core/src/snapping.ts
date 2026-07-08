import { fromSeconds, toSeconds, type RationalTime } from '@techsquidtv/canvas-timeline-utils';
import type { TimelineSnapResult, TimelineSnapTarget } from '#core/types';

/**
 * Controls which built-in timeline boundaries are indexed as magnetic snap targets.
 */
export interface SnapTargetOptions {
  /** Exclude the current in-point boundary from snap targets. */
  ignoreInPoint?: boolean;
  /** Exclude the current out-point boundary from snap targets. */
  ignoreOutPoint?: boolean;
}

/**
 * Binary-searchable timeline snap target index.
 */
export class SnapIndex {
  private times = new Float64Array(0);
  private targets: Array<TimelineSnapTarget | undefined> = [];
  private count = 0;

  /**
   * Removes all indexed targets while retaining allocated storage for reuse.
   */
  clear() {
    this.count = 0;
  }

  /**
   * Number of targets currently indexed.
   */
  get size() {
    return this.count;
  }

  private ensureCapacity(size: number) {
    if (this.times.length < size) {
      const nextSize = Math.max(this.times.length * 2, size, 1024);
      const nextTimes = new Float64Array(nextSize);
      nextTimes.set(this.times.subarray(0, this.count));
      this.times = nextTimes;
      this.targets.length = nextSize;
    }
  }

  private swap(left: number, right: number) {
    const leftTime = this.times[left];
    this.times[left] = this.times[right];
    this.times[right] = leftTime;

    const leftTarget = this.targets[left];
    this.targets[left] = this.targets[right];
    this.targets[right] = leftTarget;
  }

  private sortRange(left: number, right: number) {
    if (left >= right) {
      return;
    }

    const pivot = this.times[(left + right) >> 1];
    let i = left;
    let j = right;

    while (i <= j) {
      while (this.times[i] < pivot) {
        i++;
      }
      while (this.times[j] > pivot) {
        j--;
      }
      if (i <= j) {
        this.swap(i, j);
        i++;
        j--;
      }
    }

    if (left < j) {
      this.sortRange(left, j);
    }
    if (i < right) {
      this.sortRange(i, right);
    }
  }

  /**
   * Rebuilds the index from a complete snap target list.
   *
   * @param targets - Timeline snap targets to index.
   */
  build(targets: TimelineSnapTarget[]) {
    this.ensureCapacity(targets.length);

    for (let i = 0; i < targets.length; i++) {
      this.times[i] = toSeconds(targets[i].time);
      this.targets[i] = targets[i];
    }

    for (let i = targets.length; i < this.count; i++) {
      this.targets[i] = undefined;
    }

    this.count = targets.length;

    if (this.count > 1) {
      this.sortRange(0, this.count - 1);
    }
  }

  private findInsertionIndex(timeSeconds: number) {
    let low = 0;
    let high = this.count - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const midValue = this.times[mid];

      if (midValue === timeSeconds) {
        return mid;
      }
      if (midValue < timeSeconds) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return low;
  }

  private chooseBetter(
    best: { index: number; diff: number } | null,
    candidateIndex: number,
    candidateDiff: number
  ) {
    if (!best) {
      return { index: candidateIndex, diff: candidateDiff };
    }

    if (candidateDiff < best.diff) {
      return { index: candidateIndex, diff: candidateDiff };
    }

    if (candidateDiff === best.diff) {
      const bestPriority = this.targets[best.index]?.priority ?? 0;
      const candidatePriority = this.targets[candidateIndex]?.priority ?? 0;
      if (candidatePriority > bestPriority) {
        return { index: candidateIndex, diff: candidateDiff };
      }
    }

    return best;
  }

  /**
   * Finds the best target within a threshold.
   *
   * @param time - Candidate timeline time.
   * @param thresholdSeconds - Maximum snap distance in seconds.
   * @returns A rich snap result, or null when no target is close enough.
   */
  findNearest(time: RationalTime, thresholdSeconds: number): TimelineSnapResult | null {
    if (this.count === 0 || thresholdSeconds <= 0) {
      return null;
    }

    const timeSeconds = toSeconds(time);
    const insertionIndex = this.findInsertionIndex(timeSeconds);
    let best: { index: number; diff: number } | null = null;

    for (let i = insertionIndex; i < this.count; i++) {
      const diff = Math.abs(this.times[i] - timeSeconds);
      if (diff > thresholdSeconds) {
        break;
      }
      best = this.chooseBetter(best, i, diff);
    }

    for (let i = insertionIndex - 1; i >= 0; i--) {
      const diff = Math.abs(this.times[i] - timeSeconds);
      if (diff > thresholdSeconds) {
        break;
      }
      best = this.chooseBetter(best, i, diff);
    }

    if (!best) {
      return null;
    }

    const target = this.targets[best.index];
    if (!target) {
      return null;
    }

    const snappedSeconds = this.times[best.index];
    return {
      snappedTime: fromSeconds(snappedSeconds, time.r),
      target,
      deltaSeconds: snappedSeconds - timeSeconds,
      feedback: {
        lines: [snappedSeconds],
        target,
      },
    };
  }
}
