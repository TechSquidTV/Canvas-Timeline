import { useTimelineExternalStore } from '#react/hooks/core/useTimelineExternalStore';
import type { TimelineEngine } from '@techsquidtv/canvas-timeline-core';

const boundsEvents = ['content:change', 'viewport:resize', 'zoom:change', 'state:settled'] as const;

function getBounds(engine: TimelineEngine) {
  return {
    maxContentTime: engine.maxContentTime,
    maxScrollLeft: engine.maxScrollLeft,
    maxScrollTop: engine.maxScrollTop,
    minZoomScale: engine.minZoomScale,
    maxZoomScale: engine.maxZoomScale,
  };
}

/** Observes limits even when content, dimensions, or policy changes leave live values unchanged. */
export function useTimelineViewportBounds() {
  return useTimelineExternalStore(
    boundsEvents,
    getBounds,
    (previous, next) =>
      previous.maxContentTime.v === next.maxContentTime.v &&
      previous.maxContentTime.r === next.maxContentTime.r &&
      previous.maxScrollLeft === next.maxScrollLeft &&
      previous.maxScrollTop === next.maxScrollTop &&
      previous.minZoomScale === next.minZoomScale &&
      previous.maxZoomScale === next.maxZoomScale
  );
}
