import { useMemo } from 'react';
import {
  getTimelineRulerTicks,
  type TimelineRulerTick,
  type TimelineRulerTickOptions,
} from '@techsquidtv/canvas-timeline-core';
import { useTimeline } from '../core/useTimeline';
import { useTimelineGeometryRevision } from '../core/useTimelineGeometryRevision';

/** Options accepted by `useTimelineRulerTicks`. */
export type UseTimelineRulerTicksOptions = Partial<TimelineRulerTickOptions>;

/**
 * Returns shared viewport-space ruler ticks for DOM and custom timeline chrome.
 *
 * The hook subscribes to geometry-affecting timeline events and intentionally
 * does not subscribe to playhead-only updates.
 *
 * @param options - Optional viewport and frame-label overrides.
 * @returns Ruler ticks clipped to the visible viewport and optional duration.
 */
export function useTimelineRulerTicks(
  options: UseTimelineRulerTicksOptions = {}
): TimelineRulerTick[] {
  const { engine } = useTimeline();
  const revision = useTimelineGeometryRevision();
  const {
    duration,
    frameRate,
    includeLabels,
    labelFormat,
    scrollLeft,
    timecodeFormatOptions,
    viewportWidth,
    zoomScale,
  } = options;

  return useMemo(() => {
    void revision;
    const state = engine.getState();

    return getTimelineRulerTicks({
      duration: duration ?? state.duration,
      frameRate,
      includeLabels,
      labelFormat,
      scrollLeft: scrollLeft ?? state.scrollLeft,
      timecodeFormatOptions,
      viewportWidth: viewportWidth ?? (state.viewportWidth || 1000),
      zoomScale: zoomScale ?? state.zoomScale,
    });
  }, [
    duration,
    engine,
    frameRate,
    includeLabels,
    labelFormat,
    revision,
    scrollLeft,
    timecodeFormatOptions,
    viewportWidth,
    zoomScale,
  ]);
}
