import type {
  Clip,
  ClipHitTestResult,
  TimelineEngine,
  TimelineKeyframe,
  Track,
} from '@techsquidtv/canvas-timeline-core';
import { toSeconds, type RationalTime } from '@techsquidtv/canvas-timeline-utils';

export const opacityKeyframeValuePadding = 10;
const opacityKeyframeToggleRadiusPixels = 10;

export function findClipContainingTime(track: Track, time: RationalTime): Clip | null {
  const seconds = toSeconds(time);
  return (
    track.clips.find(
      (clip) => toSeconds(clip.timelineStart) <= seconds && toSeconds(clip.timelineEnd) >= seconds
    ) ?? null
  );
}

export function findOpacityKeyframeNearTime(
  clip: Clip,
  time: RationalTime,
  zoomScale: number
): TimelineKeyframe | null {
  const toleranceSeconds = opacityKeyframeToggleRadiusPixels / Math.max(1, zoomScale);
  const seconds = toSeconds(time);
  return (
    (clip.keyframes ?? []).find(
      (keyframe) =>
        keyframe.property === 'opacity' &&
        Math.abs(toSeconds(keyframe.time) - seconds) <= toleranceSeconds
    ) ?? null
  );
}

export function getOpacityValueFromClipViewportY(
  hit: ClipHitTestResult,
  viewportY: number
): number {
  const usableHeight = Math.max(1, hit.rect.height - opacityKeyframeValuePadding * 2);
  const ratio = Math.max(
    0,
    Math.min(1, (viewportY - hit.rect.y - opacityKeyframeValuePadding) / usableHeight)
  );
  return 1 - ratio;
}

export function toggleOpacityKeyframeAtTime(
  engine: TimelineEngine,
  clipId: string,
  time: RationalTime,
  value: number
): boolean {
  const found = engine.getClip(clipId);
  if (!found || found.track.locked) {
    return false;
  }

  const existing = findOpacityKeyframeNearTime(found.clip, time, engine.zoomScale);
  if (existing) {
    return engine.removeClipKeyframe(clipId, existing.id);
  }

  // Omitting interpolation lets new keyframes inherit the previous keyframe's
  // interpolation mode and easing, keeping the segment's curve character.
  return Boolean(
    engine.setClipKeyframe({
      clipId,
      property: 'opacity',
      time,
      value,
    })
  );
}
