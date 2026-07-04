import { clamp, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { useCallback, useMemo } from 'react';
import {
  useRangeScrollbar,
  type RangeScrollbarRootProps,
  type RangeScrollbarValue,
  type RangeScrollbarValueChangeDetails,
  type UseRangeScrollbarResult,
} from '../../rangeScrollbar';
import { useTimeline } from '../core/useTimeline';
import { useTimelineViewport } from './useTimelineViewport';

const DEFAULT_MIN_VIEW_DURATION_SECONDS = 0.1;
const KEYBOARD_NUDGE_PX = 40;
const KEYBOARD_PAGE_NUDGE_RATIO = 0.8;

/**
 * Options for adapting a generic range scrollbar to the timeline viewport.
 */
export interface UseTimelineViewportScrollbarOptions {
  /** Smallest allowed visible timeline duration in seconds. Defaults to 0.1. */
  minSpan?: number;
}

/**
 * Controlled props required by `RangeScrollbar.Root` for a timeline viewport.
 */
export type TimelineViewportScrollbarRangeProps = Pick<
  RangeScrollbarRootProps,
  'keyboardPageStep' | 'keyboardStep' | 'max' | 'min' | 'minSpan' | 'onValueChange' | 'value'
>;

/**
 * State and control props for rendering a timeline viewport scrollbar.
 */
export interface UseTimelineViewportScrollbarResult {
  /** Generic range scrollbar state derived from timeline viewport state. */
  range: UseRangeScrollbarResult;
  /** Props that wire `RangeScrollbar.Root` to timeline scroll and zoom state. */
  rootProps: TimelineViewportScrollbarRangeProps;
  /** Full timeline duration represented by the scrollbar domain, in seconds. */
  totalDurationSeconds: number;
  /** Visible viewport start time in seconds. */
  viewStartSeconds: number;
  /** Visible viewport end time in seconds. */
  viewEndSeconds: number;
  /** Visible viewport duration in seconds. */
  viewDurationSeconds: number;
  /** Measured timeline viewport width in pixels. */
  viewportWidth: number;
  /** Current timeline zoom scale in pixels per second. */
  zoomScale: number;
  /** Current horizontal timeline scroll offset in pixels. */
  scrollLeft: number;
  /** Handles controlled range changes by panning or zooming the timeline engine. */
  onValueChange: (value: RangeScrollbarValue, details: RangeScrollbarValueChangeDetails) => void;
}

/**
 * Adapts generic range scrollbar state to the current timeline viewport.
 *
 * The hook derives a controlled `{ start, end }` value from timeline
 * `scrollLeft`, `zoomScale`, `viewportWidth`, and content duration. Thumb
 * changes pan the engine, while handle changes update zoom and then restore the
 * requested range start.
 *
 * @param options - Timeline viewport range options.
 * @returns Timeline viewport metrics plus `RangeScrollbar.Root` control props.
 *
 * @example
 * ```tsx
 * const viewportScrollbar = useTimelineViewportScrollbar();
 *
 * return (
 *   <RangeScrollbar.Root {...viewportScrollbar.rootProps}>
 *     <RangeScrollbar.Thumb>
 *       <RangeScrollbar.Handle side="start" />
 *       <RangeScrollbar.Handle side="end" />
 *     </RangeScrollbar.Thumb>
 *   </RangeScrollbar.Root>
 * );
 * ```
 */
export function useTimelineViewportScrollbar(
  options: UseTimelineViewportScrollbarOptions = {}
): UseTimelineViewportScrollbarResult {
  const { engine } = useTimeline();
  const viewport = useTimelineViewport();
  const metrics = useMemo(() => {
    const viewportWidth = viewport.viewportWidth;
    const maxZoomSpan =
      Number.isFinite(engine.maxZoomScale) && engine.maxZoomScale > 0
        ? viewportWidth / engine.maxZoomScale
        : 0;
    const minSpan = Math.max(options.minSpan ?? DEFAULT_MIN_VIEW_DURATION_SECONDS, maxZoomSpan);
    const zoomScale = viewport.zoomScale;
    const scrollLeft = viewport.scrollLeft;
    const totalDurationSeconds = Math.max(minSpan, toSeconds(viewport.maxContentTime));
    const rawViewStart = scrollLeft / zoomScale;
    const rawViewDuration = viewportWidth / zoomScale;
    const viewDurationSeconds = Math.min(totalDurationSeconds, rawViewDuration);
    const maxViewStart = Math.max(0, totalDurationSeconds - viewDurationSeconds);
    const viewStartSeconds = clamp(rawViewStart, 0, maxViewStart);
    const viewEndSeconds = viewStartSeconds + viewDurationSeconds;
    const value = { start: viewStartSeconds, end: viewEndSeconds };

    return {
      minSpan,
      scrollLeft,
      totalDurationSeconds,
      value,
      viewDurationSeconds,
      viewEndSeconds,
      viewStartSeconds,
      viewportWidth,
      zoomScale,
    };
  }, [
    engine.maxZoomScale,
    options.minSpan,
    viewport.maxContentTime,
    viewport.scrollLeft,
    viewport.viewportWidth,
    viewport.zoomScale,
  ]);

  const onValueChange = useCallback(
    (nextValue: RangeScrollbarValue, details: RangeScrollbarValueChangeDetails) => {
      if (details.reason === 'thumb-drag' || details.reason === 'thumb-keyboard') {
        engine.setScrollLeft(nextValue.start * metrics.zoomScale);
        return;
      }

      const nextDuration = Math.max(metrics.minSpan, nextValue.end - nextValue.start);
      engine.setZoomScale(metrics.viewportWidth / nextDuration);
      const appliedZoomScale = engine.getState().zoomScale;
      engine.setScrollLeft(nextValue.start * appliedZoomScale);
    },
    [engine, metrics.minSpan, metrics.viewportWidth, metrics.zoomScale]
  );

  const range = useRangeScrollbar({
    min: 0,
    max: metrics.totalDurationSeconds,
    value: metrics.value,
    minSpan: metrics.minSpan,
    onValueChange,
  });

  return {
    range,
    rootProps: {
      min: 0,
      max: metrics.totalDurationSeconds,
      value: metrics.value,
      minSpan: metrics.minSpan,
      keyboardStep: KEYBOARD_NUDGE_PX / metrics.zoomScale,
      keyboardPageStep: (metrics.viewportWidth * KEYBOARD_PAGE_NUDGE_RATIO) / metrics.zoomScale,
      onValueChange,
    },
    totalDurationSeconds: metrics.totalDurationSeconds,
    viewStartSeconds: metrics.viewStartSeconds,
    viewEndSeconds: metrics.viewEndSeconds,
    viewDurationSeconds: metrics.viewDurationSeconds,
    viewportWidth: metrics.viewportWidth,
    zoomScale: metrics.zoomScale,
    scrollLeft: metrics.scrollLeft,
    onValueChange,
  };
}
