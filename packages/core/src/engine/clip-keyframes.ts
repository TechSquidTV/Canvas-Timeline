import type { Clip } from '#core/types';
import { hasTimelineKeyframes } from '#core/snapshot';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { addRational, toSeconds } from '@techsquidtv/canvas-timeline-utils';

/**
 * Shifts all keyframes on a clip by a timeline delta.
 *
 * @param clip - Clip whose keyframes should move.
 * @param deltaTime - Timeline time delta to add to each keyframe.
 */
export function shiftClipKeyframes(clip: Clip, deltaTime: RationalTime) {
  if (!hasTimelineKeyframes(clip) || toSeconds(deltaTime) === 0) {
    return;
  }

  clip.keyframes = clip.keyframes?.map((keyframe) => ({
    ...keyframe,
    time: addRational(keyframe.time, deltaTime),
  }));
}
