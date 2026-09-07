import { createTimelineScalarKeyframeProperty } from '@techsquidtv/canvas-timeline-core';
import type {
  TimelineReadonly,
  Clip,
  ClipHitTestResult,
  TimelineEngine,
  TimelineKeyframe,
  Track,
} from '@techsquidtv/canvas-timeline-core';
import { toSeconds } from '@techsquidtv/canvas-timeline-utils';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
export const opacityKeyframeProperty = createTimelineScalarKeyframeProperty({
  id: 'opacity',
  label: 'Opacity',
  min: 0,
  max: 1,
  defaultValue: 1,
  formatValue: (value) => `${Math.round(value * 100)}%`,
  getBaseValue: (clip) => clip.opacity ?? 1,
});

export const opacityKeyframeValuePadding = 10;
const opacityKeyframeToggleRadiusPixels = 10;

export function findClipContainingTime(
  track: TimelineReadonly<Track>,
  time: RationalTime
): TimelineReadonly<Clip> | null {
  const seconds = toSeconds(time);
  return (
    track.clips.find(
      (clip) => toSeconds(clip.timelineStart) <= seconds && toSeconds(clip.timelineEnd) >= seconds
    ) ?? null
  );
}

export function findOpacityKeyframeNearTime(
  clip: TimelineReadonly<Clip>,
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
  const found = engine.geometry.getClip(clipId);
  if (!found || found.track.locked) {
    return false;
  }

  const existing = findOpacityKeyframeNearTime(found.clip, time, engine.zoomScale);
  if (existing) {
    return engine.keyframes.removeClipKeyframe(clipId, existing.id);
  }

  // New keyframes use linear side defaults until the app assigns side interpolation.
  return Boolean(
    engine.keyframes.setClipKeyframe({
      clipId,
      property: 'opacity',
      time,
      value,
    })
  );
}
