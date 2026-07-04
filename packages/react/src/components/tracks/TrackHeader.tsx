import React from 'react';
import {
  defaultTimelineInteractionGeometry,
  type TimelineTrackGeometryOptions,
} from '@techsquidtv/canvas-timeline-core';
import {
  useTimelineTrack,
  useTimelineTrackHeader,
  useTimelineScrollTop,
  type UseTimelineTrackHeaderResult,
} from '../../hooks';

/** Props for the track header list column. */
export interface TrackHeaderListProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Height of the timeline ruler area above track rows. */
  rulerHeight?: number;
}

export const TrackHeaderList = React.forwardRef<HTMLDivElement, TrackHeaderListProps>(
  (
    {
      children,
      className = '',
      rulerHeight = defaultTimelineInteractionGeometry.rulerHeight,
      style,
      ...props
    },
    ref
  ) => {
    const scrollTop = useTimelineScrollTop();
    const listStyle: React.CSSProperties & {
      '--track-header-ruler-height': string;
    } = {
      '--track-header-ruler-height': `${rulerHeight}px`,
      paddingTop: `${rulerHeight}px`,
      ...style,
    };

    return (
      <div
        ref={ref}
        className={['timeline-track-header-list', className].filter(Boolean).join(' ')}
        role="rowgroup"
        style={listStyle}
        {...props}
      >
        <div
          className="timeline-track-header-list-content"
          style={{ transform: `translateY(${-scrollTop}px)` }}
        >
          {children}
        </div>
      </div>
    );
  }
);

TrackHeaderList.displayName = 'Timeline.TrackHeaderList';

/** Render prop accepted by `Timeline.TrackHeader`. */
export type TrackHeaderChildren =
  | React.ReactNode
  | ((header: UseTimelineTrackHeaderResult) => React.ReactNode);

/** Props for one timeline track header row. */
export interface TrackHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Id of the track row represented by this header. */
  trackId: string;
  /** Track geometry overrides matching the renderer. */
  geometry?: TimelineTrackGeometryOptions;
  /** Custom content or render prop receiving the headless header state. */
  children?: TrackHeaderChildren;
}

export const TrackHeader = React.forwardRef<HTMLDivElement, TrackHeaderProps>(
  ({ trackId, geometry, children, className = '', style, ...props }, ref) => {
    const header = useTimelineTrackHeader(trackId, geometry);
    const { style: headerStyle, ...rootProps } = header.rootProps;
    const content = typeof children === 'function' ? children(header) : children;

    return (
      <div
        {...rootProps}
        {...props}
        ref={ref}
        className={['timeline-track-header', className].filter(Boolean).join(' ')}
        style={{ ...headerStyle, ...style }}
      >
        {content}
      </div>
    );
  }
);

TrackHeader.displayName = 'Timeline.TrackHeader';

/** Props for the track header resize handle. */
export interface TrackHeaderResizeHandleProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Id of the track row resized by this handle. */
  trackId: string;
  /** Track geometry overrides matching the renderer. */
  geometry?: TimelineTrackGeometryOptions;
  /** Minimum expanded track height in pixels. */
  minHeight?: number;
  /** Maximum expanded track height in pixels. */
  maxHeight?: number;
}

export const TrackHeaderResizeHandle = React.forwardRef<
  HTMLDivElement,
  TrackHeaderResizeHandleProps
>(
  (
    {
      trackId,
      geometry,
      className = '',
      minHeight = defaultTimelineInteractionGeometry.collapsedTrackHeight,
      maxHeight,
      onPointerCancel,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      ...props
    },
    ref
  ) => {
    const trackState = useTimelineTrack(trackId, geometry);
    const resizeState = React.useRef<{
      pointerId: number;
      startHeight: number;
      startY: number;
    } | null>(null);

    const finishResize = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
      const activeResize = resizeState.current;
      if (activeResize === null || activeResize.pointerId !== event.pointerId) {
        return;
      }

      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be released by the browser.
      }
      resizeState.current = null;
    }, []);

    const handlePointerDown = React.useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        onPointerDown?.(event);
        if (event.defaultPrevented) {
          return;
        }
        if (event.pointerType !== 'touch' && event.button !== 0) {
          return;
        }

        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        resizeState.current = {
          pointerId: event.pointerId,
          startHeight: trackState.collapsed
            ? (trackState.track?.height ?? defaultTimelineInteractionGeometry.trackHeight)
            : trackState.height,
          startY: event.clientY,
        };
      },
      [onPointerDown, trackState.collapsed, trackState.height, trackState.track]
    );

    const handlePointerMove = React.useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        onPointerMove?.(event);
        const activeResize = resizeState.current;
        if (
          event.defaultPrevented ||
          activeResize === null ||
          activeResize.pointerId !== event.pointerId
        ) {
          return;
        }

        const rawHeight = activeResize.startHeight + event.clientY - activeResize.startY;
        const boundedHeight =
          maxHeight === undefined ? Math.max(minHeight, rawHeight) : Math.min(maxHeight, rawHeight);
        trackState.setTrackHeight(Math.max(minHeight, boundedHeight));
      },
      [maxHeight, minHeight, onPointerMove, trackState]
    );

    const handlePointerUp = React.useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        onPointerUp?.(event);
        finishResize(event);
      },
      [finishResize, onPointerUp]
    );

    const handlePointerCancel = React.useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        onPointerCancel?.(event);
        finishResize(event);
      },
      [finishResize, onPointerCancel]
    );

    return (
      <div
        ref={ref}
        aria-label="Resize track"
        aria-orientation="horizontal"
        className={['timeline-track-header-resize-handle', className].filter(Boolean).join(' ')}
        data-track-id={trackId}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        role="separator"
        tabIndex={0}
        {...props}
      />
    );
  }
);

TrackHeaderResizeHandle.displayName = 'Timeline.TrackHeaderResizeHandle';
