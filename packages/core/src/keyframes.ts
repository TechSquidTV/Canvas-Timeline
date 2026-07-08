import type {
  TimelineKeyframeBezierHandle,
  TimelineKeyframePoint,
  TimelineKeyframeInterpolation,
  TimelineKeyframePropertyDefinition,
  TimelineKeyframeSideInterpolation,
} from '#core/types';

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
 * Default outgoing tangent used when a Bezier keyframe side omits its handle.
 */
export const defaultTimelineOutgoingBezierHandle: TimelineKeyframeBezierHandle = {
  x: 0.42,
  y: 0,
};

/**
 * Default incoming tangent used when a Bezier keyframe side omits its handle.
 */
export const defaultTimelineIncomingBezierHandle: TimelineKeyframeBezierHandle = {
  x: 0.58,
  y: 1,
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
  interpolation: TimelineKeyframeInterpolation | undefined
): TimelineKeyframeInterpolation {
  if (interpolation === 'hold' || interpolation === 'bezier') {
    return interpolation;
  }
  return 'linear';
}

/**
 * Validates and clamps one Bezier tangent handle to the timeline interpolation domain.
 *
 * @param handle - Optional Bezier tangent handle.
 * @param fallback - Fallback handle used when `handle` is omitted.
 * @returns Normalized Bezier tangent handle.
 */
export function normalizeTimelineKeyframeBezierHandle(
  handle: TimelineKeyframeBezierHandle | undefined,
  fallback: TimelineKeyframeBezierHandle
): TimelineKeyframeBezierHandle {
  const source = handle ?? fallback;
  return {
    x: clampUnitInterval(source.x, 'handle.x'),
    y: clampUnitInterval(source.y, 'handle.y'),
  };
}

/**
 * Normalizes one side of a keyframe.
 *
 * @param side - Optional keyframe side interpolation.
 * @param fallbackHandle - Fallback Bezier tangent handle for this side.
 * @returns Normalized keyframe side interpolation.
 */
export function normalizeTimelineKeyframeSideInterpolation(
  side: TimelineKeyframeSideInterpolation | undefined,
  fallbackHandle: TimelineKeyframeBezierHandle
): TimelineKeyframeSideInterpolation {
  const interpolation = normalizeTimelineKeyframeInterpolation(side?.interpolation);
  if (interpolation !== 'bezier') {
    return { interpolation };
  }
  return {
    interpolation,
    handle: normalizeTimelineKeyframeBezierHandle(side?.handle, fallbackHandle),
  };
}

/**
 * Creates a scalar keyframe property definition from a numeric range.
 *
 * @param options - Property id, range, default value, and optional label/format/base-value hooks.
 * @returns A complete scalar keyframe property definition.
 */
export function createTimelineScalarKeyframeProperty<PropertyId extends string>(options: {
  id: PropertyId;
  label?: string;
  min: number;
  max: number;
  defaultValue: number;
  formatValue?: (value: number) => string;
  getBaseValue?: TimelineKeyframePropertyDefinition<PropertyId>['getBaseValue'];
}): TimelineKeyframePropertyDefinition<PropertyId> {
  assertFiniteTimelineNumber(options.min, 'options.min');
  assertFiniteTimelineNumber(options.max, 'options.max');
  assertFiniteTimelineNumber(options.defaultValue, 'options.defaultValue');
  if (options.max <= options.min) {
    throw new RangeError('options.max must be greater than options.min.');
  }

  const min = options.min;
  const max = options.max;
  const defaultValue = options.defaultValue;
  const span = max - min;
  const clampValue = (value: number) => {
    assertFiniteTimelineNumber(value, 'value');
    return Math.max(min, Math.min(max, value));
  };
  return {
    id: options.id,
    ...(options.label === undefined ? {} : { label: options.label }),
    min,
    max,
    defaultValue: clampValue(defaultValue),
    clampValue,
    normalizeValue: (value: number) => clampUnitInterval((clampValue(value) - min) / span, 'value'),
    denormalizeValue: (normalized: number) =>
      clampValue(min + clampUnitInterval(normalized, 'normalized') * span),
    ...(options.formatValue === undefined ? {} : { formatValue: options.formatValue }),
    ...(options.getBaseValue === undefined ? {} : { getBaseValue: options.getBaseValue }),
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
): TimelineKeyframePoint {
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
 * @param outgoing - Optional normalized outgoing tangent handle from the start keyframe.
 * @param incoming - Optional normalized incoming tangent handle from the end keyframe.
 * @returns Viewport-space control points for the segment curve.
 */
export function getTimelineKeyframeBezierControlPoints(
  startPoint: TimelineKeyframePoint,
  endPoint: TimelineKeyframePoint,
  outgoing: TimelineKeyframeBezierHandle | undefined,
  incoming: TimelineKeyframeBezierHandle | undefined
): {
  controlPoint1: TimelineKeyframePoint;
  controlPoint2: TimelineKeyframePoint;
} {
  const outgoingHandle = normalizeTimelineKeyframeBezierHandle(
    outgoing,
    defaultTimelineOutgoingBezierHandle
  );
  const incomingHandle = normalizeTimelineKeyframeBezierHandle(
    incoming,
    defaultTimelineIncomingBezierHandle
  );
  const deltaX = endPoint.x - startPoint.x;
  const deltaY = endPoint.y - startPoint.y;

  return {
    controlPoint1: {
      x: startPoint.x + deltaX * outgoingHandle.x,
      y: startPoint.y + deltaY * outgoingHandle.y,
    },
    controlPoint2: {
      x: startPoint.x + deltaX * incomingHandle.x,
      y: startPoint.y + deltaY * incomingHandle.y,
    },
  };
}

/**
 * Evaluates a Cubic Bezier segment curve at normalized time progress.
 *
 * @param progress - Normalized segment progress from 0 to 1.
 * @param outgoing - Optional normalized outgoing tangent handle from the start keyframe.
 * @param incoming - Optional normalized incoming tangent handle from the end keyframe.
 * @returns Normalized eased progress from 0 to 1.
 */
export function getTimelineKeyframeBezierProgress(
  progress: number,
  outgoing: TimelineKeyframeBezierHandle | undefined,
  incoming: TimelineKeyframeBezierHandle | undefined
): number {
  const normalizedProgress = clampUnitInterval(progress, 'progress');
  if (normalizedProgress === 0 || normalizedProgress === 1) {
    return normalizedProgress;
  }

  const outgoingHandle = normalizeTimelineKeyframeBezierHandle(
    outgoing,
    defaultTimelineOutgoingBezierHandle
  );
  const incomingHandle = normalizeTimelineKeyframeBezierHandle(
    incoming,
    defaultTimelineIncomingBezierHandle
  );
  let t = normalizedProgress;

  for (let iteration = 0; iteration < 8; iteration++) {
    const x = cubicBezierCoordinate(outgoingHandle.x, incomingHandle.x, t);
    const derivative = cubicBezierDerivative(outgoingHandle.x, incomingHandle.x, t);
    if (Math.abs(x - normalizedProgress) < 0.000001 || derivative === 0) {
      break;
    }
    t = Math.max(0, Math.min(1, t - (x - normalizedProgress) / derivative));
  }

  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 10; iteration++) {
    const x = cubicBezierCoordinate(outgoingHandle.x, incomingHandle.x, t);
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
    cubicBezierCoordinate(outgoingHandle.y, incomingHandle.y, t),
    'easedProgress'
  );
}

/**
 * Evaluates normalized segment progress for a keyframe interpolation mode.
 *
 * @param interpolation - Optional interpolation mode from the outgoing keyframe.
 * @param progress - Normalized segment progress from 0 to 1.
 * @param outgoing - Optional outgoing tangent handle used when interpolation is `bezier`.
 * @param incoming - Optional incoming tangent handle used when interpolation is `bezier`.
 * @returns Normalized progress after applying the interpolation mode.
 */
export function getTimelineKeyframeInterpolationProgress(
  interpolation: TimelineKeyframeInterpolation,
  progress: number,
  outgoing?: TimelineKeyframeBezierHandle,
  incoming?: TimelineKeyframeBezierHandle
): number {
  switch (normalizeTimelineKeyframeInterpolation(interpolation)) {
    case 'hold':
      return 0;
    case 'bezier':
      return getTimelineKeyframeBezierProgress(progress, outgoing, incoming);
    case 'linear':
      return clampUnitInterval(progress, 'progress');
  }
}
