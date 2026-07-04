import React, { useRef } from 'react';
import { useTimeline } from '../../hooks';

import type { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { toSeconds, type RationalTime } from '@techsquidtv/canvas-timeline-utils';

import { consumeTimelineDoubleTap } from '../interactions/tapState';

/**
 * Props for the interactive playhead scrub area.
 */
export interface PlayheadAreaProps {
  /** Additional class names applied to the absolute-positioned scrub area. */
  className?: string;
  /** Custom handler for double-click or double-tap marker behavior at a timeline time. */
  onDoubleClick?: (
    time: RationalTime,
    engine: TimelineEngine,
    e: React.PointerEvent | React.MouseEvent
  ) => void;
}

export const PlayheadArea = React.forwardRef<
  HTMLDivElement,
  PlayheadAreaProps & Omit<React.HTMLAttributes<HTMLDivElement>, 'onDoubleClick'>
>(({ className = '', onDoubleClick, ...props }, forwardedRef) => {
  const { engine } = useTimeline();
  const internalRef = useRef<HTMLDivElement>(null);

  const ref = React.useCallback(
    (node: HTMLDivElement | null) => {
      internalRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    },
    [forwardedRef]
  );

  const triggerDoubleClick = (e: React.PointerEvent | React.MouseEvent, x: number) => {
    const time = engine.pixelToTime(x);
    if (onDoubleClick) {
      onDoubleClick(time, engine, e);
    } else {
      const clickRadiusSec = 10 / engine.zoomScale; // 10 pixels in seconds
      const clickedMarker = engine.markers.find(
        (m) => Math.abs(toSeconds(m.time) - toSeconds(time)) <= clickRadiusSec
      );

      if (clickedMarker) {
        engine.removeMarker(clickedMarker.id);
      } else {
        const label = `M${engine.markers.length + 1}`;
        engine.addMarker(time, label);
      }
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' && e.button !== 0) {
      return;
    }
    e.stopPropagation();

    if (consumeTimelineDoubleTap(e)) {
      const rect = internalRef.current?.getBoundingClientRect();
      if (rect) {
        const x = e.clientX - rect.left;
        triggerDoubleClick(e, x);
      }
      e.preventDefault();
      return;
    }

    const target = e.currentTarget as HTMLElement;
    const rect = internalRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    engine.pause();
    target.setPointerCapture(e.pointerId);
    e.preventDefault();

    const rectLeft = rect.left;

    const updatePlayhead = (clientX: number) => {
      const x = clientX - rectLeft;
      const newTime = engine.pixelToTime(x);
      engine.updatePlayhead(newTime);
    };

    updatePlayhead(e.clientX);

    const onPointerMove = (ev: PointerEvent) => {
      updatePlayhead(ev.clientX);
    };

    const onPointerUp = (ev: PointerEvent) => {
      try {
        target.releasePointerCapture(ev.pointerId);
      } catch {
        // Ignore
      }
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointercancel', onPointerUp);
      engine.settle();
    };

    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerUp);
    target.addEventListener('pointercancel', onPointerUp);
  };

  return (
    <div
      ref={ref}
      className={`timeline-playhead-area absolute top-0 left-0 w-full h-8 cursor-text z-30 pointer-events-auto select-none touch-none ${className}`}
      onPointerDown={handlePointerDown}
      title="Scrub timeline / Double click or double tap to add marker"
      {...props}
    />
  );
});

PlayheadArea.displayName = 'Timeline.PlayheadArea';
