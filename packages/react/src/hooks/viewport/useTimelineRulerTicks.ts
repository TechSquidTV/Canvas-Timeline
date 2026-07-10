import { useMemo } from 'react';
import {
  getTimelineRulerTicks,
  type TimelineRulerFormatOptions,
  type TimelineRulerGeometryOptions,
  type TimelineRulerTick,
} from '@techsquidtv/canvas-timeline-core';
import { useTimeline } from '#react/hooks/core/useTimeline';
import { useTimelineGeometryRevision } from '#react/hooks/core/useTimelineGeometryRevision';

/** Options accepted by `useTimelineRulerTicks`. */
export type UseTimelineRulerTicksOptions = Partial<TimelineRulerGeometryOptions> &
  TimelineRulerFormatOptions;

function getRulerFormatOptions(
  format: TimelineRulerFormatOptions['format'],
  frameRate: TimelineRulerFormatOptions['frameRate'],
  timecodeFormatOptions: TimelineRulerFormatOptions['timecodeFormatOptions']
): TimelineRulerFormatOptions {
  if (format === 'timecode') {
    if (frameRate === undefined) {
      throw new TypeError('A timecode ruler requires a frame rate.');
    }
    return { format, frameRate, timecodeFormatOptions };
  }

  if (format === 'frame-number') {
    if (frameRate === undefined) {
      throw new TypeError('A frame-number ruler requires a frame rate.');
    }
    return { format, frameRate };
  }

  return { format: 'seconds' };
}

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
  options: UseTimelineRulerTicksOptions = { format: 'seconds' }
): TimelineRulerTick[] {
  const { engine } = useTimeline();
  const revision = useTimelineGeometryRevision();
  const {
    duration,
    format,
    frameRate,
    includeLabels,
    minimumMajorTickSpacing,
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
      includeLabels,
      minimumMajorTickSpacing,
      scrollLeft: scrollLeft ?? state.scrollLeft,
      viewportWidth: viewportWidth ?? (state.viewportWidth || 1000),
      zoomScale: zoomScale ?? state.zoomScale,
      ...getRulerFormatOptions(format, frameRate, timecodeFormatOptions),
    });
  }, [
    duration,
    engine,
    format,
    frameRate,
    includeLabels,
    minimumMajorTickSpacing,
    revision,
    scrollLeft,
    timecodeFormatOptions,
    viewportWidth,
    zoomScale,
  ]);
}
