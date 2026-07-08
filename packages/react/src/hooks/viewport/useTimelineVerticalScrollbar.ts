import { useCallback, useMemo, useRef } from 'react';
import {
  defaultTimelineInteractionGeometry,
  type TimelineTrackHeightUpdate,
} from '@techsquidtv/canvas-timeline-core';
import { clamp } from '@techsquidtv/canvas-timeline-utils';
import {
  useRangeScrollbar,
  type RangeScrollbarHandleSide,
  type RangeScrollbarRootProps,
  type RangeScrollbarValue,
  type RangeScrollbarValueChangeDetails,
  type UseRangeScrollbarResult,
} from '#react/rangeScrollbar';
import { useTimeline } from '#react/hooks/core/useTimeline';
import { useTimelineViewport } from '#react/hooks/viewport/useTimelineViewport';

const KEYBOARD_NUDGE_PX = 40;
const KEYBOARD_PAGE_NUDGE_RATIO = 0.8;
const MIN_VERTICAL_TRACK_HEIGHT = defaultTimelineInteractionGeometry.collapsedTrackHeight;
const MAX_VERTICAL_TRACK_HEIGHT = defaultTimelineInteractionGeometry.trackHeight * 4;

interface VerticalZoomDragSession {
  id: number;
  side: RangeScrollbarHandleSide;
  startValue: RangeScrollbarValue;
  trackHeights: Map<string, number>;
}

/**
 * Controlled props required by `RangeScrollbar.Root` for vertical timeline scrolling.
 */
export type TimelineVerticalScrollbarRangeProps = Pick<
  RangeScrollbarRootProps,
  | 'keyboardPageStep'
  | 'keyboardStep'
  | 'getAriaValueText'
  | 'max'
  | 'min'
  | 'minSpan'
  | 'onValueChange'
  | 'orientation'
  | 'value'
>;

/**
 * State and control props for rendering a vertical timeline scrollbar.
 */
export interface UseTimelineVerticalScrollbarResult {
  /** Generic range scrollbar state derived from vertical timeline viewport state. */
  range: UseRangeScrollbarResult;
  /** Props that wire `RangeScrollbar.Root` to timeline vertical scroll state. */
  rootProps: TimelineVerticalScrollbarRangeProps;
  /** Full vertical track stack height represented by the scrollbar domain, in pixels. */
  contentHeight: number;
  /** Visible viewport top offset in pixels. */
  viewStartPixels: number;
  /** Visible viewport bottom offset in pixels. */
  viewEndPixels: number;
  /** Visible viewport height in pixels. */
  viewHeight: number;
  /** Current vertical timeline scroll offset in pixels. */
  scrollTop: number;
  /** Maximum vertical timeline scroll offset in pixels. */
  maxScrollTop: number;
  /** Handles controlled range changes by panning or vertically zooming track rows. */
  onValueChange: (value: RangeScrollbarValue, details: RangeScrollbarValueChangeDetails) => void;
}

/**
 * Adapts generic range scrollbar state to the timeline's vertical track viewport.
 *
 * The hook derives a controlled `{ start, end }` value from `scrollTop`,
 * `viewportHeight`, and track-stack bounds. Thumb changes pan the engine-owned
 * vertical scroll position so canvas rows and external DOM chrome can stay in sync.
 * Handle changes scale expanded track heights, giving the range handles a
 * vertical zoom behavior that matches the horizontal viewport scrollbar's shape.
 *
 * @returns Timeline vertical metrics plus `RangeScrollbar.Root` control props.
 */
export function useTimelineVerticalScrollbar(): UseTimelineVerticalScrollbarResult {
  const { engine } = useTimeline();
  const viewport = useTimelineViewport();
  const zoomDragSessionRef = useRef<VerticalZoomDragSession | null>(null);
  const metrics = useMemo(() => {
    const viewHeight = viewport.viewportHeight;
    const contentHeight = Math.max(viewHeight, viewport.maxScrollTop + viewHeight);
    const viewStartPixels = Math.min(viewport.scrollTop, viewport.maxScrollTop);
    const viewEndPixels = Math.min(contentHeight, viewStartPixels + viewHeight);
    const value = { start: viewStartPixels, end: viewEndPixels };
    const minSpan = Math.min(viewHeight, defaultTimelineInteractionGeometry.trackHeight);

    return {
      contentHeight,
      maxScrollTop: viewport.maxScrollTop,
      minSpan,
      scrollTop: viewport.scrollTop,
      value,
      viewEndPixels,
      viewHeight,
      viewStartPixels,
    };
  }, [viewport.maxScrollTop, viewport.scrollTop, viewport.viewportHeight]);

  const onValueChange = useCallback(
    (nextValue: RangeScrollbarValue, details: RangeScrollbarValueChangeDetails) => {
      if (details.reason !== 'handle-drag' && details.reason !== 'handle-keyboard') {
        zoomDragSessionRef.current = null;
        engine.setScrollTop(nextValue.start);
        return;
      }

      const dragSession =
        details.reason === 'handle-drag' && details.dragSessionId !== undefined
          ? zoomDragSessionRef.current?.id === details.dragSessionId &&
            zoomDragSessionRef.current.side === details.side
            ? zoomDragSessionRef.current
            : {
                id: details.dragSessionId,
                side: details.side ?? 'end',
                startValue: details.dragStartValue ?? metrics.value,
                trackHeights: new Map(
                  engine.tracks.map((track) => [
                    track.id,
                    track.height ?? defaultTimelineInteractionGeometry.trackHeight,
                  ])
                ),
              }
          : null;

      if (dragSession) {
        zoomDragSessionRef.current = dragSession;
      }

      const startValue = dragSession?.startValue ?? metrics.value;
      const currentSpan = Math.max(metrics.minSpan, startValue.end - startValue.start);
      const nextSpan = Math.max(metrics.minSpan, nextValue.end - nextValue.start);
      const scaleFactor = currentSpan / nextSpan;
      const nextScrollTop =
        details.side === 'start'
          ? nextValue.end * scaleFactor - metrics.viewHeight
          : nextValue.start * scaleFactor;

      if (Number.isFinite(scaleFactor) && Math.abs(scaleFactor - 1) > 0.001) {
        const heightUpdates: TimelineTrackHeightUpdate[] = [];
        for (const track of engine.tracks) {
          if (track.collapsed) {
            continue;
          }

          const currentHeight =
            dragSession?.trackHeights.get(track.id) ??
            track.height ??
            defaultTimelineInteractionGeometry.trackHeight;
          const nextHeight = clamp(
            Math.round(currentHeight * scaleFactor),
            MIN_VERTICAL_TRACK_HEIGHT,
            MAX_VERTICAL_TRACK_HEIGHT
          );
          heightUpdates.push({ trackId: track.id, height: nextHeight });
        }
        engine.setTrackHeights(heightUpdates, { scrollTop: nextScrollTop });
        return;
      }

      engine.setScrollTop(nextScrollTop);
    },
    [engine, metrics.minSpan, metrics.value, metrics.viewHeight]
  );

  const range = useRangeScrollbar({
    min: 0,
    max: metrics.contentHeight,
    value: metrics.value,
    minSpan: metrics.minSpan,
    onValueChange,
  });

  return {
    range,
    rootProps: {
      min: 0,
      max: metrics.contentHeight,
      value: metrics.value,
      minSpan: metrics.minSpan,
      orientation: 'vertical',
      keyboardStep: KEYBOARD_NUDGE_PX,
      keyboardPageStep: metrics.viewHeight * KEYBOARD_PAGE_NUDGE_RATIO,
      onValueChange,
    },
    contentHeight: metrics.contentHeight,
    viewStartPixels: metrics.viewStartPixels,
    viewEndPixels: metrics.viewEndPixels,
    viewHeight: metrics.viewHeight,
    scrollTop: metrics.scrollTop,
    maxScrollTop: metrics.maxScrollTop,
    onValueChange,
  };
}
