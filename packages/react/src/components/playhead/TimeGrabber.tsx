import React, { useEffect, useRef, useState } from 'react';
import type { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { addRational, fromSeconds, type RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useTimelineTimePosition, type TimelineTimePositionEvent } from '#react/hooks';

const DEFAULT_POSITION_EVENTS: TimeGrabberProps['positionEvents'] = ['render'];

/** Render-prop payload for custom draggable time grabber children. */
export interface TimeGrabberRenderProps {
  /** Whether the grabber is actively being dragged. */
  dragging: boolean;
  /** Current time represented by the grabber. */
  time: RationalTime;
  /** Timeline engine that owns drag updates. */
  engine: TimelineEngine;
}

/** Custom node or render prop used inside a draggable time grabber. */
export type TimeGrabberChildren =
  | React.ReactNode
  | ((props: TimeGrabberRenderProps) => React.ReactNode);

export interface TimeGrabberProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'children' | 'onDragStart' | 'onDragEnd'
> {
  /** Additional class names applied to the positioned grabber shell. */
  className?: string;
  /** Timeline engine used for positioning and drag updates. */
  engine: TimelineEngine;
  /** Resolves the latest represented time for imperative event-driven updates. */
  getTime?: () => RationalTime;
  /** Optional classes added to the default grabber affordance parts. */
  partClassNames?: {
    highlight?: string;
    line?: string;
    handle?: string;
  };
  /** Current time represented by this grabber. */
  time: RationalTime;
  /** Event names that should re-sync DOM position without a React render. */
  positionEvents?: TimelineTimePositionEvent[];
  /** Called when a drag starts after pointer capture is acquired. */
  onDragStart?: () => void;
  /** Called with each dragged time. */
  onDragTimeChange: (time: RationalTime) => void;
  /** Called when dragging ends after the engine settles. */
  onDragEnd?: () => void;
  /** Custom composable children node or render prop function. */
  children?: TimeGrabberChildren;
}

export const TimeGrabber = React.forwardRef<HTMLDivElement, TimeGrabberProps>(
  (
    {
      children,
      className = '',
      engine,
      getTime,
      onDragEnd,
      onDragStart,
      onDragTimeChange,
      onPointerDown,
      partClassNames,
      positionEvents = DEFAULT_POSITION_EVENTS,
      style,
      time,
      ...props
    },
    forwardedRef
  ) => {
    const [dragging, setDragging] = useState(false);
    const activeDragRef = useRef<{
      pointerId: number;
      target: HTMLElement;
      move: (ev: PointerEvent) => void;
      up: (ev: PointerEvent) => void;
    } | null>(null);
    const position = useTimelineTimePosition<HTMLDivElement>({
      engine,
      getTime,
      positionEvents,
      time,
    });
    const ref = React.useCallback(
      (node: HTMLDivElement | null) => {
        position.ref.current = node;
        if (typeof forwardedRef === 'function') {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef, position.ref]
    );

    useEffect(() => {
      return () => {
        if (activeDragRef.current) {
          activeDragRef.current.target.removeEventListener(
            'pointermove',
            activeDragRef.current.move
          );
          activeDragRef.current.target.removeEventListener('pointerup', activeDragRef.current.up);
          activeDragRef.current.target.removeEventListener(
            'pointercancel',
            activeDragRef.current.up
          );
          try {
            activeDragRef.current.target.releasePointerCapture(activeDragRef.current.pointerId);
          } catch {
            // Ignore browsers or test environments that already released capture.
          }
          document.body.classList.remove('is-dragging-timeline-grabber');
        }
      };
    }, []);

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      onPointerDown?.(e);
      if (e.defaultPrevented || (e.pointerType !== 'touch' && e.button !== 0)) {
        return;
      }

      e.stopPropagation();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      setDragging(true);
      document.body.classList.add('is-dragging-timeline-grabber');
      onDragStart?.();

      const startX = e.clientX;
      const startTime = getTime?.() ?? time;

      const onPointerMove = (ev: PointerEvent) => {
        const deltaX = ev.clientX - startX;
        const deltaTimeSec = deltaX / engine.zoomScale;
        const deltaRt = fromSeconds(deltaTimeSec, startTime.r);
        onDragTimeChange(addRational(startTime, deltaRt));
      };

      const onPointerUp = (ev: PointerEvent) => {
        try {
          target.releasePointerCapture(ev.pointerId);
        } catch {
          // Ignore browsers or test environments that already released capture.
        }
        target.removeEventListener('pointermove', onPointerMove);
        target.removeEventListener('pointerup', onPointerUp);
        target.removeEventListener('pointercancel', onPointerUp);
        activeDragRef.current = null;
        document.body.classList.remove('is-dragging-timeline-grabber');
        engine.settle();
        setDragging(false);
        onDragEnd?.();
      };

      activeDragRef.current = {
        pointerId: e.pointerId,
        target,
        move: onPointerMove,
        up: onPointerUp,
      };

      target.addEventListener('pointermove', onPointerMove);
      target.addEventListener('pointerup', onPointerUp);
      target.addEventListener('pointercancel', onPointerUp);
    };

    const renderContent = () => {
      const resolvedTime = getTime?.() ?? time;
      if (children !== undefined) {
        return typeof children === 'function'
          ? children({ dragging, time: resolvedTime, engine })
          : children;
      }

      return (
        <div
          className={['timeline-time-grabber-highlight', partClassNames?.highlight]
            .filter(Boolean)
            .join(' ')}
        >
          <div
            className={['timeline-time-grabber-line', partClassNames?.line]
              .filter(Boolean)
              .join(' ')}
          />
          <div
            className={['timeline-time-grabber-handle', partClassNames?.handle]
              .filter(Boolean)
              .join(' ')}
          />
        </div>
      );
    };

    return (
      <div
        ref={ref}
        className={['timeline-time-grabber', dragging ? 'is-dragging' : '', className]
          .filter(Boolean)
          .join(' ')}
        style={{
          transform: 'translateX(0px)',
          willChange: 'transform',
          ...style,
        }}
        onPointerDown={handlePointerDown}
        {...props}
      >
        {renderContent()}
      </div>
    );
  }
);

TimeGrabber.displayName = 'Timeline.TimeGrabber';
