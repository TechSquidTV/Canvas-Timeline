import type { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { useTimelineExternalStore } from '#react/hooks/core/useTimelineExternalStore';

const zoomScaleEvents = ['zoom:change', 'render'] as const;
const getTimelineZoomScale = (engine: TimelineEngine) => engine.zoomScale;

/**
 * Hook to subscribe directly to zoom changes.
 * Bypasses root-level context state updates for low-latency zoom interaction.
 *
 * @returns The current zoom scale factor (pixels per second).
 */
export function useTimelineZoomScale(): number {
  return useTimelineExternalStore(zoomScaleEvents, getTimelineZoomScale);
}
