import React, {
  useCallback,
  useRef,
  type CanvasHTMLAttributes,
  type MutableRefObject,
} from 'react';
import {
  useTimelineCanvasLayer,
  type UseTimelineCanvasLayerOptions,
} from './useTimelineCanvasLayer';

/** Props for the package custom canvas layer component. */
export interface TimelineCanvasLayerProps<TrackKind = string>
  extends
    Omit<CanvasHTMLAttributes<HTMLCanvasElement>, 'children'>,
    UseTimelineCanvasLayerOptions<TrackKind> {}

/** App-owned canvas layer for drawing custom dense timeline visuals. */
export const TimelineCanvasLayer = React.forwardRef<HTMLCanvasElement, TimelineCanvasLayerProps>(
  function TimelineCanvasLayer(
    {
      className = '',
      style,
      draw,
      overscanPixels,
      redrawOnPlayhead,
      clearBeforeDraw,
      collapsedTrackHeight,
      edgeThreshold,
      rulerHeight,
      touchEdgeThreshold,
      trackHeight,
      ...props
    },
    forwardedRef
  ) {
    const internalRef = useRef<HTMLCanvasElement | null>(null);
    const setRef = useCallback(
      (node: HTMLCanvasElement | null) => {
        internalRef.current = node;
        if (typeof forwardedRef === 'function') {
          forwardedRef(node);
        } else if (forwardedRef) {
          (forwardedRef as MutableRefObject<HTMLCanvasElement | null>).current = node;
        }
      },
      [forwardedRef]
    );

    useTimelineCanvasLayer(internalRef, {
      clearBeforeDraw,
      collapsedTrackHeight,
      draw,
      edgeThreshold,
      overscanPixels,
      redrawOnPlayhead,
      rulerHeight,
      touchEdgeThreshold,
      trackHeight,
    });

    return (
      <canvas
        ref={setRef}
        className={`timeline-custom-canvas-layer ${className}`.trim()}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'block',
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          ...style,
        }}
        {...props}
      />
    );
  }
);
