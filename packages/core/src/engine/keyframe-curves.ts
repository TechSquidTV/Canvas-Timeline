import {
  normalizeTimelineKeyframeSideInterpolation,
  getTimelineKeyframeBezierParameter,
  evaluateTimelineCubicBezier,
} from '#core/keyframes';
import type { KeyframePropertyRegistry } from '#core/engine/keyframe-property-registry';
import type {
  Clip,
  TimelineKeyframe,
  TimelineKeyframePoint,
  TimelineKeyframeSideInterpolation,
  TimelineReadonly,
} from '#core/types';
import { cloneTimelineKeyframe, sortTimelineKeyframes } from '#core/snapshot';
import { compareRational, subRational, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';

/** Normalized property-space curve shared by evaluation, geometry and subdivision. */
export interface KeyframeCurve {
  mode: 'linear' | 'hold' | 'bezier';
  start: TimelineKeyframePoint;
  control1: TimelineKeyframePoint;
  control2: TimelineKeyframePoint;
  end: TimelineKeyframePoint;
}

export function resolveKeyframeCurve(
  left: TimelineReadonly<TimelineKeyframe>,
  right: TimelineReadonly<TimelineKeyframe>,
  registry: KeyframePropertyRegistry
): KeyframeCurve {
  const start = { x: 0, y: registry.normalizeValue(left.property, left.value) ?? 0 };
  const end = { x: 1, y: registry.normalizeValue(right.property, right.value) ?? 0 };
  const outgoing = normalizeTimelineKeyframeSideInterpolation(left.outgoing, {
    x: 0.42,
    y: start.y,
  });
  const incoming = normalizeTimelineKeyframeSideInterpolation(right.incoming, {
    x: 0.58,
    y: end.y,
  });
  const mode =
    outgoing.interpolation === 'hold'
      ? 'hold'
      : outgoing.interpolation === 'bezier' || incoming.interpolation === 'bezier'
        ? 'bezier'
        : 'linear';
  return {
    mode,
    start,
    end,
    control1: outgoing.handle ?? { x: 0.42, y: start.y },
    control2: incoming.handle ?? { x: 0.58, y: end.y },
  };
}

function mix(a: TimelineKeyframePoint, b: TimelineKeyframePoint, t: number): TimelineKeyframePoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function split(curve: KeyframeCurve, t: number) {
  const a = mix(curve.start, curve.control1, t);
  const b = mix(curve.control1, curve.control2, t);
  const c = mix(curve.control2, curve.end, t);
  const d = mix(a, b, t);
  const e = mix(b, c, t);
  return { a, c, d, e, point: mix(d, e, t) };
}

export function evaluateKeyframeCurve(curve: KeyframeCurve, progress: number): number {
  if (progress <= 0) {
    return curve.start.y;
  }
  if (progress >= 1) {
    return curve.end.y;
  }
  if (curve.mode === 'hold') {
    return curve.start.y;
  }
  if (curve.mode === 'linear') {
    return mix(curve.start, curve.end, progress).y;
  }
  const value = evaluateTimelineCubicBezier(
    curve.start.y,
    curve.control1.y,
    curve.control2.y,
    curve.end.y,
    getTimelineKeyframeBezierParameter(progress, curve.control1.x, curve.control2.x)
  );
  // Control points lie in [0, 1]; contain arithmetic roundoff at the property bounds.
  return Math.max(0, Math.min(1, value));
}

/** Inserts a curve-preserving key. Existing keys at the exact time are returned unchanged. */
export function insertCurveKeyframe(
  clip: Clip,
  property: string,
  time: RationalTime,
  registry: KeyframePropertyRegistry,
  allocateId: () => string
): TimelineKeyframe {
  const definition = registry.get(property);
  if (!definition) {
    throw new RangeError(`Unregistered keyframe property "${property}".`);
  }
  clip.keyframes ??= [];
  const keys = clip.keyframes.filter((key) => key.property === property);
  sortTimelineKeyframes(keys);
  const existing = keys.find((key) => compareRational(key.time, time) === 0);
  if (existing) {
    return existing;
  }
  const rightIndex = keys.findIndex((key) => compareRational(key.time, time) > 0);
  const left = rightIndex === -1 ? keys.at(-1) : keys[rightIndex - 1];
  const right = rightIndex === -1 ? undefined : keys[rightIndex];
  const key: TimelineKeyframe = {
    id: allocateId(),
    property,
    time: { ...time },
    value:
      left?.value ??
      right?.value ??
      registry.clampDefinitionValue(
        definition,
        definition.getBaseValue?.(clip) ?? definition.defaultValue,
        'base value'
      ),
  };
  if (left && right) {
    const curve = resolveKeyframeCurve(left, right, registry);
    const progress =
      toSeconds(subRational(time, left.time)) / toSeconds(subRational(right.time, left.time));
    key.value = registry.denormalizeDefinitionValue(
      definition,
      evaluateKeyframeCurve(curve, progress),
      'inserted value'
    );
    if (curve.mode === 'bezier') {
      const { a, c, d, e } = split(
        curve,
        getTimelineKeyframeBezierParameter(progress, curve.control1.x, curve.control2.x)
      );
      const side = (
        point: TimelineKeyframePoint,
        offset: number,
        span: number
      ): TimelineKeyframeSideInterpolation => ({
        interpolation: 'bezier',
        handle: { x: Math.max(0, Math.min(1, (point.x - offset) / span)), y: point.y },
      });
      left.outgoing = side(a, 0, progress);
      key.incoming = side(d, 0, progress);
      key.outgoing = side(e, progress, 1 - progress);
      right.incoming = side(c, progress, 1 - progress);
    } else {
      key.incoming = { interpolation: curve.mode };
      key.outgoing = { interpolation: curve.mode };
    }
  }
  clip.keyframes.push(key);
  sortTimelineKeyframes(clip.keyframes);
  return key;
}

/** Clips every property curve to the new clip range without changing retained samples. */
export function preserveClipKeyframeRange(
  clip: Clip,
  registry: KeyframePropertyRegistry,
  allocateId: (key: string) => string
) {
  if (!clip.keyframes?.length) {
    return;
  }
  clip.keyframes = clip.keyframes.map(cloneTimelineKeyframe);
  for (const property of new Set(clip.keyframes.map((key) => key.property))) {
    for (const [side, time] of [
      ['start', clip.timelineStart],
      ['end', clip.timelineEnd],
    ] as const) {
      const keys = clip.keyframes.filter((key) => key.property === property);
      if (
        keys.some((key) =>
          side === 'start'
            ? compareRational(key.time, time) < 0
            : compareRational(key.time, time) > 0
        )
      ) {
        insertCurveKeyframe(clip, property, time, registry, () =>
          allocateId(`boundary:${clip.id}:${property}:${time.v}/${time.r}`)
        );
      }
    }
  }
  clip.keyframes = clip.keyframes.filter(
    (key) =>
      compareRational(key.time, clip.timelineStart) >= 0 &&
      compareRational(key.time, clip.timelineEnd) <= 0
  );
}
