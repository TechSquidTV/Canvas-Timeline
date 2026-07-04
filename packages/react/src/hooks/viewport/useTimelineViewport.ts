import { useCallback } from 'react';
import {
  clamp,
  fromSeconds,
  toSeconds,
  type RationalTime,
} from '@techsquidtv/canvas-timeline-utils';
import { useTimeline } from '../core/useTimeline';
import { useTimelineScrollLeft } from './useTimelineScrollLeft';
import { useTimelineScrollTop } from './useTimelineScrollTop';
import { useTimelineZoomScale } from './useTimelineZoomScale';
import { timelineCommandOk, type TimelineCommandResult } from '../core/timelineCommandResult';

/** Result returned by `useTimelineViewport`. */
export interface UseTimelineViewportResult {
  /** Current horizontal timeline scroll offset in pixels. */
  scrollLeft: number;
  /** Current vertical timeline scroll offset in pixels. */
  scrollTop: number;
  /** Current zoom scale in pixels per second. */
  zoomScale: number;
  /** Measured timeline viewport width in pixels. */
  viewportWidth: number;
  /** Measured timeline viewport height in pixels. */
  viewportHeight: number;
  /** Explicit timeline duration, or undefined when duration follows content bounds. */
  duration: RationalTime | undefined;
  /** Maximum timeline content time used for playback and scroll bounds. */
  maxContentTime: RationalTime;
  /** Maximum horizontal scroll offset for the current viewport and content duration. */
  maxScrollLeft: number;
  /** Maximum vertical scroll offset for the current viewport and track stack. */
  maxScrollTop: number;
  /** Raw viewport duration represented by the current width and zoom. */
  viewportDurationTime: RationalTime;
  /** Raw viewport duration in seconds represented by the current width and zoom. */
  viewportDurationSeconds: number;
  /** Visible viewport start time. */
  visibleStartTime: RationalTime;
  /** Visible viewport end time, clamped to content bounds. */
  visibleEndTime: RationalTime;
  /** Visible viewport duration, clamped to content bounds. */
  visibleDurationTime: RationalTime;
  /** Visible viewport start time in seconds for display-only UI. */
  visibleStartSeconds: number;
  /** Visible viewport end time in seconds for display-only UI. */
  visibleEndSeconds: number;
  /** Visible viewport duration in seconds for display-only UI. */
  visibleDurationSeconds: number;
  /** Sets horizontal scroll offset, with final clamping delegated to the engine. */
  setScrollLeft: (scrollLeft: number) => TimelineCommandResult;
  /** Sets vertical scroll offset, with final clamping delegated to the engine. */
  setScrollTop: (scrollTop: number) => TimelineCommandResult;
  /** Sets zoom scale, with final clamping delegated to the engine. */
  setZoomScale: (zoomScale: number) => TimelineCommandResult;
  /** Stores the measured timeline viewport width in the engine. */
  setViewportWidth: (width: number) => TimelineCommandResult;
  /** Stores the measured timeline viewport height in the engine. */
  setViewportHeight: (height: number) => TimelineCommandResult;
  /** Sets an explicit timeline duration, or clears it when passed undefined. */
  setDuration: (duration: RationalTime | undefined) => TimelineCommandResult;
}

/**
 * Provides canonical viewport metrics and setters for custom timeline chrome.
 *
 * @returns Viewport metrics, visible time range, and viewport setters.
 */
export function useTimelineViewport(): UseTimelineViewportResult {
  const { engine, state } = useTimeline();
  const scrollLeft = useTimelineScrollLeft();
  const scrollTop = useTimelineScrollTop();
  const zoomScale = useTimelineZoomScale();

  const setScrollLeft = useCallback(
    (nextScrollLeft: number) => {
      engine.setScrollLeft(nextScrollLeft);
      return timelineCommandOk();
    },
    [engine]
  );

  const setZoomScale = useCallback(
    (nextZoomScale: number) => {
      engine.setZoomScale(nextZoomScale);
      return timelineCommandOk();
    },
    [engine]
  );

  const setScrollTop = useCallback(
    (nextScrollTop: number) => {
      engine.setScrollTop(nextScrollTop);
      return timelineCommandOk();
    },
    [engine]
  );

  const setViewportWidth = useCallback(
    (width: number) => {
      engine.setViewportWidth(width);
      return timelineCommandOk();
    },
    [engine]
  );

  const setViewportHeight = useCallback(
    (height: number) => {
      engine.setViewportHeight(height);
      return timelineCommandOk();
    },
    [engine]
  );

  const setDuration = useCallback(
    (duration: RationalTime | undefined) => {
      engine.setDuration(duration);
      return timelineCommandOk();
    },
    [engine]
  );

  const viewportWidth = state.viewportWidth || 1000;
  const viewportHeight = state.viewportHeight ?? 600;
  const safeZoomScale = Math.max(zoomScale || 0, 0.1);
  const maxContentTime = engine.maxContentTime;
  const duration = state.duration;
  const maxScrollLeft = engine.maxScrollLeft;
  const maxScrollTop = engine.maxScrollTop;
  const viewportDurationSeconds = viewportWidth / safeZoomScale;
  const visibleStartSeconds = clamp(scrollLeft / safeZoomScale, 0, toSeconds(maxContentTime));
  const visibleEndSeconds = Math.min(
    toSeconds(maxContentTime),
    visibleStartSeconds + viewportDurationSeconds
  );
  const visibleDurationSeconds = visibleEndSeconds - visibleStartSeconds;
  const viewportDurationTime = fromSeconds(viewportDurationSeconds, maxContentTime.r);
  const visibleStartTime = fromSeconds(visibleStartSeconds, maxContentTime.r);
  const visibleEndTime = fromSeconds(visibleEndSeconds, maxContentTime.r);
  const visibleDurationTime = fromSeconds(visibleDurationSeconds, maxContentTime.r);

  return {
    scrollLeft,
    scrollTop,
    zoomScale: safeZoomScale,
    viewportWidth,
    viewportHeight,
    duration,
    maxContentTime,
    maxScrollLeft,
    maxScrollTop,
    viewportDurationTime,
    viewportDurationSeconds,
    visibleStartTime,
    visibleEndTime,
    visibleDurationTime,
    visibleStartSeconds,
    visibleEndSeconds,
    visibleDurationSeconds,
    setScrollLeft,
    setScrollTop,
    setZoomScale,
    setViewportWidth,
    setViewportHeight,
    setDuration,
  };
}
