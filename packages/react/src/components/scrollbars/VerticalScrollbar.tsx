import React from 'react';
import {
  RangeScrollbar,
  type RangeScrollbarHandleProps,
  type RangeScrollbarRootProps,
  type RangeScrollbarThumbProps,
} from '../../rangeScrollbar';
import { useTimelineVerticalRangeControl } from '../../hooks';

/** Props for the timeline vertical scrollbar root. */
export type VerticalScrollbarRootProps = Omit<
  RangeScrollbarRootProps,
  'max' | 'min' | 'minSpan' | 'onValueChange' | 'orientation' | 'value'
>;

/** Props for the timeline vertical scrollbar thumb. */
export type VerticalScrollbarThumbProps = RangeScrollbarThumbProps;

/** Props for a timeline vertical scrollbar resize handle. */
export type VerticalScrollbarHandleProps = RangeScrollbarHandleProps;

/**
 * Timeline-aware scrollbar root for panning the vertical track viewport.
 *
 * @param props - Timeline vertical scrollbar DOM props.
 * @returns A range scrollbar root wired to the current `TimelineEngine`.
 */
export const VerticalScrollbarRoot = React.forwardRef<HTMLDivElement, VerticalScrollbarRootProps>(
  ({ children, className = '', ...props }, ref) => {
    const verticalScrollbar = useTimelineVerticalRangeControl();

    return (
      <RangeScrollbar.Root
        ref={ref}
        className={['timeline-vertical-scrollbar', className].filter(Boolean).join(' ')}
        {...verticalScrollbar.rootProps}
        {...props}
      >
        {children}
      </RangeScrollbar.Root>
    );
  }
);

VerticalScrollbarRoot.displayName = 'Timeline.VerticalScrollbar';

/**
 * Draggable timeline vertical scrollbar thumb.
 *
 * @param props - DOM props and optional custom content for the vertical thumb.
 * @returns A range scrollbar thumb that pans the timeline track viewport.
 */
export const VerticalScrollbarThumb = React.forwardRef<HTMLDivElement, VerticalScrollbarThumbProps>(
  ({ className = '', ...props }, ref) => (
    <RangeScrollbar.Thumb
      ref={ref}
      className={['timeline-vertical-scrollbar-thumb', className].filter(Boolean).join(' ')}
      aria-label={props['aria-label'] ?? 'Timeline vertical viewport'}
      {...props}
    />
  )
);

VerticalScrollbarThumb.displayName = 'Timeline.VerticalScrollbarThumb';

/**
 * Timeline vertical scrollbar resize handle.
 *
 * @param props - Handle props.
 * @returns A range scrollbar handle for custom vertical range compositions.
 */
export const VerticalScrollbarHandle = React.forwardRef<
  HTMLDivElement,
  VerticalScrollbarHandleProps
>((props, ref) => (
  <RangeScrollbar.Handle
    ref={ref}
    {...props}
    className={['timeline-vertical-scrollbar-handle', props.className].filter(Boolean).join(' ')}
    aria-label={
      props['aria-label'] ??
      (props.side === 'start'
        ? 'Timeline vertical viewport start'
        : 'Timeline vertical viewport end')
    }
  />
));

VerticalScrollbarHandle.displayName = 'Timeline.VerticalScrollbarHandle';

/**
 * Namespace of timeline-aware vertical scrollbar components.
 */
// oxlint-disable-next-line react-refresh/only-export-components
export const VerticalScrollbar = {
  /** Root element wired to timeline vertical scroll state. */
  Root: VerticalScrollbarRoot,
  /** Draggable thumb that pans the timeline track viewport. */
  Thumb: VerticalScrollbarThumb,
  /** Range handle for custom vertical range compositions. */
  Handle: VerticalScrollbarHandle,
};
