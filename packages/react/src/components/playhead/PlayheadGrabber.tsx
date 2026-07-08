import React from 'react';
import { useTimeline } from '#react/hooks';

import type { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { toSeconds, type RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { consumeTimelineDoubleTap } from '#react/components/interactions/tapState';
import {
  TimeGrabber,
  type TimeGrabberChildren,
  type TimeGrabberProps,
} from '#react/components/playhead/TimeGrabber';

const PLAYHEAD_PART_CLASS_NAMES: TimeGrabberProps['partClassNames'] = {
  highlight: 'timeline-playhead-grabber-highlight',
  line: 'timeline-playhead-grabber-line',
  handle: 'timeline-playhead-grabber-handle',
};

const PLAYHEAD_POSITION_EVENTS: TimeGrabberProps['positionEvents'] = ['render', 'playhead:scrub'];

/**
 * Props for the draggable playhead handle.
 */
export interface PlayheadGrabberProps {
  /** Additional class names applied to the draggable playhead handle. */
  className?: string;
  /** Custom handler for double-click or double-tap marker behavior at the playhead. */
  onDoubleClick?: (time: RationalTime, engine: TimelineEngine, e: React.PointerEvent) => void;
  /** Custom composable children node or render prop function. */
  children?: TimeGrabberChildren;
}

export const PlayheadGrabber = React.forwardRef<
  HTMLDivElement,
  PlayheadGrabberProps & Omit<React.HTMLAttributes<HTMLDivElement>, 'onDoubleClick' | 'children'>
>(
  (
    {
      className = '',
      onDoubleClick,
      children,
      onDragEnd: _onDragEnd,
      onDragStart: _onDragStart,
      onPointerDown,
      ...props
    },
    forwardedRef
  ) => {
    const { engine } = useTimeline();

    const triggerDoubleClick = React.useCallback(
      (e: React.PointerEvent) => {
        if (onDoubleClick) {
          onDoubleClick(engine.playheadTime, engine, e);
        } else {
          const clickRadiusSec = 10 / engine.zoomScale;
          const clickedMarker = engine.markers.find(
            (m) => Math.abs(toSeconds(m.time) - toSeconds(engine.playheadTime)) <= clickRadiusSec
          );

          if (clickedMarker) {
            engine.removeMarker(clickedMarker.id);
          } else {
            const label = `M${engine.markers.length + 1}`;
            engine.addMarker(engine.playheadTime, label);
          }
        }
      },
      [engine, onDoubleClick]
    );

    const getPlayheadTime = React.useCallback(() => engine.playheadTime, [engine]);

    const handleDragTimeChange = React.useCallback(
      (time: RationalTime) => {
        engine.updatePlayhead(time);
      },
      [engine]
    );

    const handleDragStart = React.useCallback(() => {
      engine.pause();
    }, [engine]);

    const handlePointerDown = React.useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        onPointerDown?.(e);
        if (e.defaultPrevented) {
          return;
        }
        if (e.pointerType !== 'touch' && e.button !== 0) {
          return;
        }
        e.stopPropagation();

        if (consumeTimelineDoubleTap(e)) {
          triggerDoubleClick(e);
          e.preventDefault();
          return;
        }
      },
      [onPointerDown, triggerDoubleClick]
    );

    return (
      <TimeGrabber
        ref={forwardedRef}
        className={['timeline-playhead-grabber', className].filter(Boolean).join(' ')}
        engine={engine}
        getTime={getPlayheadTime}
        onDragStart={handleDragStart}
        onDragTimeChange={handleDragTimeChange}
        onPointerDown={handlePointerDown}
        partClassNames={PLAYHEAD_PART_CLASS_NAMES}
        positionEvents={PLAYHEAD_POSITION_EVENTS}
        time={engine.playheadTime}
        {...props}
      >
        {children}
      </TimeGrabber>
    );
  }
);

PlayheadGrabber.displayName = 'Timeline.PlayheadGrabber';
