import type { Clip, TimelineReadonly } from '#core/types';
import { assertValidRationalTime, compareRational } from '@techsquidtv/canvas-timeline-utils';

export function assertValidTimelineNumber(value: number, label: string) {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number.`);
  }
}

export function assertNonNegativeTimelineNumber(value: number, label: string) {
  assertValidTimelineNumber(value, label);
  if (value < 0) {
    throw new RangeError(`${label} must be greater than or equal to 0.`);
  }
}

export function assertPositiveTimelineNumber(value: number, label: string) {
  assertValidTimelineNumber(value, label);
  if (value <= 0) {
    throw new RangeError(`${label} must be greater than 0.`);
  }
}

export function assertValidClipTiming(clip: TimelineReadonly<Clip>, label: string) {
  assertValidRationalTime(clip.timelineStart, `${label}.timelineStart`);
  assertValidRationalTime(clip.timelineEnd, `${label}.timelineEnd`);
  assertValidRationalTime(clip.sourceStart, `${label}.sourceStart`);
  if (compareRational(clip.timelineEnd, clip.timelineStart) <= 0) {
    throw new RangeError(`${label}.timelineEnd must be after ${label}.timelineStart.`);
  }
  if (clip.minStart !== undefined) {
    assertValidRationalTime(clip.minStart, `${label}.minStart`);
  }
  if (clip.maxEnd !== undefined) {
    assertValidRationalTime(clip.maxEnd, `${label}.maxEnd`);
  }
  if (
    clip.minStart !== undefined &&
    clip.maxEnd !== undefined &&
    compareRational(clip.maxEnd, clip.minStart) <= 0
  ) {
    throw new RangeError(`${label}.maxEnd must be after ${label}.minStart.`);
  }
}
