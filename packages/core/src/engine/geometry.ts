import type { TimelineInteractionGeometry } from '#core/types';
import type { TimecodeFrameRate } from '@techsquidtv/canvas-timeline-utils';

/** Default zoom-in density when a frame rate constrains timeline zoom. */
export const defaultTimelineMaxPixelsPerFrame = 16;

/**
 * Engine-owned constraints for horizontal timeline zoom.
 */
export interface TimelineZoomConstraints {
  /** Optional media or sequence frame rate used to cap zoom-in density. */
  frameRate?: TimecodeFrameRate;
  /** Maximum width of a single frame in pixels. Defaults to 16 when `frameRate` is set. */
  maxPixelsPerFrame?: number;
  /** Optional lower bound in pixels per second, applied in addition to content-fit zoom. */
  minZoomScale?: number;
  /** Optional upper bound in pixels per second, applied in addition to any frame-rate cap. */
  maxZoomScale?: number;
}

/** Geometry defaults shared by canvas-aligned interaction layers. */
export const defaultTimelineInteractionGeometry = {
  /** Height of the ruler/header band above track rows in CSS pixels. */
  rulerHeight: 32,
  /** Default expanded track row height in CSS pixels. */
  trackHeight: 48,
  /** Default collapsed track row height in CSS pixels. */
  collapsedTrackHeight: 24,
  /** Mouse and pen edge hit-test threshold in CSS pixels. */
  edgeThreshold: 10,
  /** Wider touch edge hit-test threshold in CSS pixels. */
  touchEdgeThreshold: 24,
} as const;

export const defaultTimelineViewportWidth = 1000;
export const defaultTimelineViewportHeight = 600;

export interface ResolvedTimelineInteractionGeometry {
  rulerHeight: number;
  trackHeight: number;
  collapsedTrackHeight: number;
  edgeThreshold: number;
  touchEdgeThreshold: number;
}

export function resolveTimelineInteractionGeometry(
  geometry: TimelineInteractionGeometry = {}
): ResolvedTimelineInteractionGeometry {
  return {
    rulerHeight: geometry.rulerHeight ?? defaultTimelineInteractionGeometry.rulerHeight,
    trackHeight: geometry.trackHeight ?? defaultTimelineInteractionGeometry.trackHeight,
    collapsedTrackHeight:
      geometry.collapsedTrackHeight ?? defaultTimelineInteractionGeometry.collapsedTrackHeight,
    edgeThreshold: geometry.edgeThreshold ?? defaultTimelineInteractionGeometry.edgeThreshold,
    touchEdgeThreshold:
      geometry.touchEdgeThreshold ?? defaultTimelineInteractionGeometry.touchEdgeThreshold,
  };
}

export function normalizeViewportCoordinate(value: number) {
  return Object.is(value, -0) ? 0 : value;
}

export function clampViewportCoordinate(value: number, min: number, max: number) {
  return normalizeViewportCoordinate(Math.max(min, Math.min(value, max)));
}
