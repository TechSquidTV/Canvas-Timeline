import type {
  TimelineCubicBezier,
  TimelineKeyframe,
  TimelineKeyframeCurvePoint,
  TimelineKeyframeInterpolation,
} from './types';

/** Inputs for mapping a keyframe time/value pair into viewport space. */
export interface TimelineKeyframePointInput {
  /** Timeline X coordinate in viewport CSS pixels before edge clamping. */
  timeX: number;
  /** Numeric property value normalized into the clip value range. */
  value: number;
  /** Clip left edge in viewport CSS pixels. */
  clipX: number;
  /** Clip width in viewport CSS pixels. */
  clipWidth: number;
  /** Clip top edge in viewport CSS pixels. */
  clipY: number;
  /** Clip height in viewport CSS pixels. */
  clipHeight: number;
  /** Vertical padding used for value-to-Y mapping. */
  valuePadding: number;
  /** Visual handle size used for edge X clamping. */
  handleSize: number;
}

/**
 * Default ease-in-out curve used when a Bezier keyframe omits easing control points.
 */
export const defaultTimelineCubicBezier: TimelineCubicBezier = {
  x1: 0.42,
  y1: 0,
  x2: 0.58,
  y2: 1,
};

function assertFiniteTimelineNumber(value: number, label: string) {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number.`);
  }
}

function clampUnitInterval(value: number, label: string) {
  assertFiniteTimelineNumber(value, label);
  return Math.max(0, Math.min(1, value));
}

function cubicBezierCoordinate(p1: number, p2: number, t: number) {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * p1 + 3 * inverse * t * t * p2 + t * t * t;
}

function cubicBezierDerivative(p1: number, p2: number, t: number) {
  const inverse = 1 - t;
  return 3 * inverse * inverse * p1 + 6 * inverse * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

/**
 * Normalizes a keyframe interpolation mode. Unknown or omitted values are treated as linear.
 *
 * @param interpolation - Optional interpolation mode from a timeline keyframe.
 * @returns A supported timeline keyframe interpolation mode.
 */
export function normalizeTimelineKeyframeInterpolation(
  interpolation: TimelineKeyframe['interpolation']
): TimelineKeyframeInterpolation {
  if (interpolation === 'hold' || interpolation === 'bezier') {
    return interpolation;
  }
  return 'linear';
}

/**
 * Validates and clamps Cubic Bezier control points to the timeline interpolation domain.
 *
 * @param easing - Optional Cubic Bezier easing control points.
 * @returns Normalized easing control points, or the default timeline Bezier curve.
 */
export function normalizeTimelineCubicBezier(
  easing: TimelineCubicBezier | undefined
): TimelineCubicBezier {
  const source = easing ?? defaultTimelineCubicBezier;
  return {
    x1: clampUnitInterval(source.x1, 'easing.x1'),
    y1: clampUnitInterval(source.y1, 'easing.y1'),
    x2: clampUnitInterval(source.x2, 'easing.x2'),
    y2: clampUnitInterval(source.y2, 'easing.y2'),
  };
}

/**
 * Maps one keyframe value to the same viewport point used by canvas drawing and DOM handles.
 *
 * @param input - Clip geometry, keyframe value, and handle metrics used for viewport mapping.
 * @returns Viewport-space point for the keyframe value.
 */
export function getTimelineKeyframeValuePoint(
  input: TimelineKeyframePointInput
): TimelineKeyframeCurvePoint {
  const handleSize = Math.max(0, input.handleSize);
  const minX = input.clipX + handleSize / 2;
  const maxX = Math.max(minX, input.clipX + input.clipWidth - handleSize / 2);
  const valuePadding = Math.max(0, input.valuePadding);
  const usableHeight = Math.max(1, input.clipHeight - valuePadding * 2);
  const value = clampUnitInterval(input.value, 'value');

  return {
    x: Math.max(minX, Math.min(input.timeX, maxX)),
    y: input.clipY + valuePadding + (1 - value) * usableHeight,
  };
}

/**
 * Returns viewport-space cubic Bezier control points between two keyframe points.
 *
 * @param startPoint - Viewport-space point for the segment's starting keyframe.
 * @param endPoint - Viewport-space point for the segment's ending keyframe.
 * @param easing - Optional normalized cubic Bezier easing control points.
 * @returns Viewport-space control points for the segment curve.
 */
export function getTimelineKeyframeBezierControlPoints(
  startPoint: TimelineKeyframeCurvePoint,
  endPoint: TimelineKeyframeCurvePoint,
  easing: TimelineCubicBezier | undefined
): {
  controlPoint1: TimelineKeyframeCurvePoint;
  controlPoint2: TimelineKeyframeCurvePoint;
} {
  const normalizedEasing = normalizeTimelineCubicBezier(easing);
  const deltaX = endPoint.x - startPoint.x;
  const deltaY = endPoint.y - startPoint.y;

  return {
    controlPoint1: {
      x: startPoint.x + deltaX * normalizedEasing.x1,
      y: startPoint.y + deltaY * normalizedEasing.y1,
    },
    controlPoint2: {
      x: startPoint.x + deltaX * normalizedEasing.x2,
      y: startPoint.y + deltaY * normalizedEasing.y2,
    },
  };
}

/**
 * Evaluates a Cubic Bezier easing curve at normalized time progress.
 *
 * @param progress - Normalized segment progress from 0 to 1.
 * @param easing - Optional Cubic Bezier easing control points.
 * @returns Normalized eased progress from 0 to 1.
 */
export function getTimelineCubicBezierProgress(
  progress: number,
  easing: TimelineCubicBezier | undefined
): number {
  const normalizedProgress = clampUnitInterval(progress, 'progress');
  if (normalizedProgress === 0 || normalizedProgress === 1) {
    return normalizedProgress;
  }

  const normalizedEasing = normalizeTimelineCubicBezier(easing);
  let t = normalizedProgress;

  for (let iteration = 0; iteration < 8; iteration++) {
    const x = cubicBezierCoordinate(normalizedEasing.x1, normalizedEasing.x2, t);
    const derivative = cubicBezierDerivative(normalizedEasing.x1, normalizedEasing.x2, t);
    if (Math.abs(x - normalizedProgress) < 0.000001 || derivative === 0) {
      break;
    }
    t = Math.max(0, Math.min(1, t - (x - normalizedProgress) / derivative));
  }

  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 10; iteration++) {
    const x = cubicBezierCoordinate(normalizedEasing.x1, normalizedEasing.x2, t);
    if (Math.abs(x - normalizedProgress) < 0.000001) {
      break;
    }
    if (x < normalizedProgress) {
      lower = t;
    } else {
      upper = t;
    }
    t = (lower + upper) / 2;
  }

  return clampUnitInterval(
    cubicBezierCoordinate(normalizedEasing.y1, normalizedEasing.y2, t),
    'easedProgress'
  );
}

/**
 * Evaluates normalized segment progress for a keyframe interpolation mode.
 *
 * @param interpolation - Optional interpolation mode from the outgoing keyframe.
 * @param progress - Normalized segment progress from 0 to 1.
 * @param easing - Optional Bezier easing used when interpolation is `bezier`.
 * @returns Normalized progress after applying the interpolation mode.
 */
export function getTimelineKeyframeInterpolationProgress(
  interpolation: TimelineKeyframe['interpolation'],
  progress: number,
  easing?: TimelineCubicBezier
): number {
  switch (normalizeTimelineKeyframeInterpolation(interpolation)) {
    case 'hold':
      return 0;
    case 'bezier':
      return getTimelineCubicBezierProgress(progress, easing);
    case 'linear':
      return clampUnitInterval(progress, 'progress');
  }
}
