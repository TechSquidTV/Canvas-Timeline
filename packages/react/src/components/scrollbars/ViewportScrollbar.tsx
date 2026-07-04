import React from 'react';
import {
  RangeScrollbar,
  type RangeScrollbarHandleProps,
  type RangeScrollbarRootProps,
  type RangeScrollbarThumbProps,
} from '../../rangeScrollbar';
import { useTimelineViewportRangeControl } from '../../hooks';
import type { UseTimelineViewportScrollbarOptions } from '../../hooks';

/**
 * Props for the timeline viewport scrollbar root.
 */
export interface ViewportScrollbarRootProps
  extends
    Omit<RangeScrollbarRootProps, 'max' | 'min' | 'minSpan' | 'onValueChange' | 'value'>,
    UseTimelineViewportScrollbarOptions {}

/**
 * Props for the timeline viewport scrollbar thumb.
 */
export type ViewportScrollbarThumbProps = RangeScrollbarThumbProps;

/**
 * Props for a timeline viewport scrollbar resize handle.
 */
export type ViewportScrollbarHandleProps = RangeScrollbarHandleProps;

/**
 * Timeline-aware scrollbar root for panning and zooming the visible viewport.
 *
 * @param props - Timeline viewport scrollbar options and DOM props.
 * @returns A range scrollbar root wired to the current `TimelineEngine`.
 *
 * @example
 * ```tsx
 * <Timeline.ViewportScrollbar>
 *   <Timeline.ViewportScrollbarThumb>
 *     <Timeline.ViewportScrollbarHandle side="start" />
 *     <Timeline.ViewportScrollbarHandle side="end" />
 *   </Timeline.ViewportScrollbarThumb>
 * </Timeline.ViewportScrollbar>
 * ```
 */
export const ViewportScrollbarRoot = React.forwardRef<HTMLDivElement, ViewportScrollbarRootProps>(
  ({ children, className = '', minSpan, ...props }, ref) => {
    const viewportScrollbar = useTimelineViewportRangeControl({ minSpan });

    return (
      <RangeScrollbar.Root
        ref={ref}
        className={['timeline-viewport-scrollbar', className].filter(Boolean).join(' ')}
        {...viewportScrollbar.rootProps}
        {...props}
      >
        {children}
      </RangeScrollbar.Root>
    );
  }
);

ViewportScrollbarRoot.displayName = 'Timeline.ViewportScrollbar';

/**
 * Draggable timeline viewport thumb.
 *
 * @param props - DOM props and optional custom content for the viewport thumb.
 * @returns A range scrollbar thumb that pans the timeline viewport.
 */
export const ViewportScrollbarThumb = React.forwardRef<HTMLDivElement, ViewportScrollbarThumbProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <RangeScrollbar.Thumb
        ref={ref}
        className={['timeline-viewport-scrollbar-thumb', className].filter(Boolean).join(' ')}
        {...props}
        aria-label={props['aria-label'] ?? 'Timeline viewport'}
      />
    );
  }
);

ViewportScrollbarThumb.displayName = 'Timeline.ViewportScrollbarThumb';

/**
 * Timeline viewport resize handle.
 *
 * @param props - Handle side, DOM props, and optional custom content.
 * @returns A range scrollbar handle that zooms the timeline viewport.
 */
export const ViewportScrollbarHandle = React.forwardRef<
  HTMLDivElement,
  ViewportScrollbarHandleProps
>(({ className = '', ...props }, ref) => {
  return (
    <RangeScrollbar.Handle
      ref={ref}
      className={['timeline-viewport-scrollbar-handle', className].filter(Boolean).join(' ')}
      {...props}
      aria-label={
        props['aria-label'] ??
        (props.side === 'start' ? 'Timeline viewport start' : 'Timeline viewport end')
      }
    />
  );
});

ViewportScrollbarHandle.displayName = 'Timeline.ViewportScrollbarHandle';

/**
 * Namespace of timeline-aware viewport scrollbar components.
 */
// oxlint-disable-next-line react-refresh/only-export-components
export const ViewportScrollbar = {
  /** Root element wired to timeline scroll and zoom state. */
  Root: ViewportScrollbarRoot,
  /** Draggable thumb that pans the timeline viewport. */
  Thumb: ViewportScrollbarThumb,
  /** Resize handle that changes timeline zoom. */
  Handle: ViewportScrollbarHandle,
};
