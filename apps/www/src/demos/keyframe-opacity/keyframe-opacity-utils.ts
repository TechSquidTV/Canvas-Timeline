import { createTimelineScalarKeyframeProperty } from '@techsquidtv/canvas-timeline-core';
import type {
  TimelineReadonly,
  Clip,
  TimelineEngine,
  TimelineKeyframe,
  TimelineKeyframeEditCommand,
  Track,
} from '@techsquidtv/canvas-timeline-core';
import { compareRational, toSeconds } from '@techsquidtv/canvas-timeline-utils';
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

export function findOpacityKeyframeAtTime(
  clip: TimelineReadonly<Clip>,
  time: RationalTime
): TimelineKeyframe | null {
  return (
    (clip.keyframes ?? []).find(
      (keyframe) => keyframe.property === 'opacity' && compareRational(keyframe.time, time) === 0
    ) ?? null
  );
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

  const existing = findOpacityKeyframeAtTime(found.clip, time);
  if (existing) {
    return engine.keyframes.removeClipKeyframe(clipId, existing.id);
  }

  // Insertion subdivides the existing curve before setting the requested value.
  return Boolean(
    engine.keyframes.setClipKeyframe({
      clipId,
      property: 'opacity',
      time,
      value,
    })
  );
}

/** App-owned easing presets expressed as progress within a segment. */
export const keyframeCurvePresets = [
  { id: 'linear', label: 'Linear', x1: 0, y1: 0, x2: 1, y2: 1 },
  { id: 'hold', label: 'Hold', x1: 0, y1: 0, x2: 1, y2: 1 },
  { id: 'ease-in', label: 'Ease in', x1: 0.42, y1: 0, x2: 1, y2: 1 },
  { id: 'ease-out', label: 'Ease out', x1: 0, y1: 0, x2: 0.58, y2: 1 },
  { id: 'ease-in-out', label: 'Ease in/out', x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
] as const;

/** Recognizes the actual two-sided curve, including custom tangent edits. */
export function getCurvePresetId(
  left: TimelineReadonly<TimelineKeyframe>,
  right: TimelineReadonly<TimelineKeyframe>
): string {
  if (left.outgoing?.interpolation === 'hold') {
    return 'hold';
  }
  if (left.outgoing?.interpolation !== 'bezier' && right.incoming?.interpolation !== 'bezier') {
    return 'linear';
  }
  const outgoing = left.outgoing?.handle ?? { x: 0.42, y: left.value };
  const incoming = right.incoming?.handle ?? { x: 0.58, y: right.value };
  const delta = right.value - left.value;
  return (
    keyframeCurvePresets.find(
      (preset) =>
        preset.id !== 'linear' &&
        preset.id !== 'hold' &&
        Math.abs(outgoing.x - preset.x1) < 1e-6 &&
        Math.abs(incoming.x - preset.x2) < 1e-6 &&
        Math.abs(outgoing.y - (left.value + delta * preset.y1)) < 1e-6 &&
        Math.abs(incoming.y - (left.value + delta * preset.y2)) < 1e-6
    )?.id ?? 'custom'
  );
}

/** Applies both ends of a segment in one undoable command. */
export function createCurvePresetCommand(
  clipId: string,
  left: TimelineReadonly<TimelineKeyframe>,
  right: TimelineReadonly<TimelineKeyframe>,
  id: string
): TimelineKeyframeEditCommand {
  const preset = keyframeCurvePresets.find((candidate) => candidate.id === id);
  if (!preset) {
    return { type: 'keyframes', edits: [] };
  }
  const interpolation = id === 'hold' ? 'hold' : id === 'linear' ? 'linear' : 'bezier';
  const delta = right.value - left.value;
  return {
    type: 'keyframes',
    edits: [
      {
        type: 'sides',
        clipId,
        keyframeId: left.id,
        outgoing: { interpolation, handle: { x: preset.x1, y: left.value + delta * preset.y1 } },
      },
      {
        type: 'sides',
        clipId,
        keyframeId: right.id,
        incoming: {
          interpolation: interpolation === 'hold' ? 'linear' : interpolation,
          handle: { x: preset.x2, y: left.value + delta * preset.y2 },
        },
      },
    ],
  };
}
