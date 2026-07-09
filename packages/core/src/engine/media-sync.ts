import type { Clip, ClipSourceRange } from '#core/types';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { addRational, compareRational, subRational } from '@techsquidtv/canvas-timeline-utils';

export function createClipSourceRange(clip: Clip): ClipSourceRange {
  const duration = subRational(clip.timelineEnd, clip.timelineStart);
  return {
    sourceId: clip.sourceId,
    start: clip.sourceStart,
    end: addRational(clip.sourceStart, duration),
    duration,
  };
}

export function createClipSyncKey(clip: Clip): string {
  return [
    clip.id,
    clip.sourceId,
    clip.timelineStart.v,
    clip.timelineStart.r,
    clip.timelineEnd.v,
    clip.timelineEnd.r,
    clip.sourceStart.v,
    clip.sourceStart.r,
  ].join(':');
}

export function mapTimelineTimeToSourceTime(
  clip: Clip,
  timelineTime: RationalTime
): RationalTime | undefined {
  if (
    compareRational(timelineTime, clip.timelineStart) < 0 ||
    compareRational(timelineTime, clip.timelineEnd) >= 0
  ) {
    return undefined;
  }

  return addRational(clip.sourceStart, subRational(timelineTime, clip.timelineStart));
}

export function mapSourceTimeToTimelineTime(
  clip: Clip,
  sourceTime: RationalTime
): RationalTime | undefined {
  const sourceEnd = addRational(
    clip.sourceStart,
    subRational(clip.timelineEnd, clip.timelineStart)
  );
  if (
    compareRational(sourceTime, clip.sourceStart) < 0 ||
    compareRational(sourceTime, sourceEnd) >= 0
  ) {
    return undefined;
  }

  return addRational(clip.timelineStart, subRational(sourceTime, clip.sourceStart));
}
