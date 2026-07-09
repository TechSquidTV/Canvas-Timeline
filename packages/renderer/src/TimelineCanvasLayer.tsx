import React, { useCallback, useRef, type CanvasHTMLAttributes } from 'react';
import {
  useTimelineCanvasLayer,
  type UseTimelineCanvasLayerOptions,
} from '#renderer/useTimelineCanvasLayer';

/**
 * Props for the package custom canvas layer component.
 *
 * @remarks
 *
 * These props combine ordinary canvas attributes with the same drawing options
 * accepted by {@link useTimelineCanvasLayer}. Use the component when the layer
 * should fill its positioned parent automatically; use the hook directly when
 * an app owns a bespoke canvas element or layout.
 *
 * @template TrackKind - App-defined track kind values carried by custom draw
 * geometry.
 */
export interface TimelineCanvasLayerProps<TrackKind = string>
  extends
    Omit<CanvasHTMLAttributes<HTMLCanvasElement>, 'children'>,
    UseTimelineCanvasLayerOptions<TrackKind> {}

/**
 * App-owned canvas layer for drawing custom dense timeline visuals.
 *
 * @remarks
 *
 * `TimelineCanvasLayer` renders an absolutely positioned, pointer-transparent
 * canvas and wires it to timeline redraws through {@link useTimelineCanvasLayer}.
 * Place it inside the same viewport stack as the primary renderer for overlays
 * such as waveforms, transcript highlights, loudness meters, or clip analysis
 * bands that should stay aligned with scroll and zoom.
 *
 * @example
 * ```tsx
 * import { TimelineCanvasLayer } from '@techsquidtv/canvas-timeline-renderer';
 *
 * export function LoudnessOverlay() {
 *   return (
 *     <TimelineCanvasLayer
 *       overscanPixels={320}
 *       draw={({ ctx, visibleClips }) => {
 *         ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
 *
 *         for (const entry of visibleClips) {
 *           ctx.fillRect(entry.x, entry.y + entry.height - 8, entry.width, 4);
 *         }
 *       }}
 *     />
 *   );
 * }
 * ```
 *
 * @see {@link UseTimelineCanvasLayerOptions}
 * @see {@link https://canvastimeline.com/docs/renderer-customization | Canvas renderer customization}
 */
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
          forwardedRef.current = node;
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
