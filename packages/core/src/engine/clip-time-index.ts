import type { Clip } from '#core/types';
import { toSeconds } from '@techsquidtv/canvas-timeline-utils';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
/** Ordered starts plus prefix maximum ends preserve overlapping clip intervals. */
export class ClipTimeIndex {
  private readonly entries;
  private readonly maximumEnds: number[];

  constructor(clips: readonly Clip[]) {
    this.entries = clips
      .map((clip, order) => ({
        clip,
        order,
        start: toSeconds(clip.timelineStart),
        end: toSeconds(clip.timelineEnd),
      }))
      .sort((a, b) => a.start - b.start);
    let maximum = -Infinity;
    this.maximumEnds = this.entries.map(({ end }) => (maximum = Math.max(maximum, end)));
  }

  at(time: RationalTime): Clip[] {
    const seconds = toSeconds(time);
    let low = 0;
    let high = this.entries.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.entries[middle].start <= seconds) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    const matches: typeof this.entries = [];
    for (let index = low - 1; index >= 0 && this.maximumEnds[index] > seconds; index--) {
      const entry = this.entries[index];
      if (entry.end > seconds) {
        matches.push(entry);
      }
    }
    return matches.sort((a, b) => a.order - b.order).map(({ clip }) => clip);
  }
}
