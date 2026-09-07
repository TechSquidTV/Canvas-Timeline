import type {
  TimelineClipGeometryOptions,
  TimelineClipRect,
  TimelineKeyframeRect,
  TimelineStateSnapshot,
  VisibleTimelineClip,
  VisibleTimelineKeyframe,
} from '@techsquidtv/canvas-timeline-core';
import { useTimeline } from '@techsquidtv/canvas-timeline-react';
import { clamp, fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
/** Reason a custom canvas layer redraw was requested. */
export type TimelineCanvasLayerRenderReason =
  | 'init'
  | 'state'
  | 'playhead'
  | 'resize'
  | 'options'
  | 'manual';

/** Viewport metrics supplied to a custom canvas layer draw callback. */
export interface TimelineCanvasLayerViewport {
  /** Current horizontal timeline scroll offset in pixels. */
  scrollLeft: number;
  /** Current zoom scale in pixels per second. */
  zoomScale: number;
  /** Measured timeline viewport width in CSS pixels. */
  viewportWidth: number;
  /** Raw viewport duration represented by the current width and zoom. */
  viewportDurationTime: RationalTime;
  /** Raw viewport duration in seconds represented by the current width and zoom. */
  viewportDurationSeconds: number;
  /** Visible viewport start time. */
  visibleStartTime: RationalTime;
  /** Visible viewport end time, clamped to content bounds. */
  visibleEndTime: RationalTime;
  /** Visible viewport duration, clamped to content bounds. */
  visibleDurationTime: RationalTime;
  /** Visible viewport start time in seconds for display-only UI. */
  visibleStartSeconds: number;
  /** Visible viewport end time in seconds for display-only UI. */
  visibleEndSeconds: number;
  /** Visible viewport duration in seconds for display-only UI. */
  visibleDurationSeconds: number;
}

/**
 * Context passed to a custom canvas layer draw callback.
 *
 * @remarks
 *
 * The context contains the current timeline snapshot plus precomputed geometry
 * so custom layers do not need to call engine hit-test APIs during every draw.
 * Prefer `visibleClips` and `visibleKeyframes` for dense rendering; use the
 * full rect arrays only for overlays that truly need offscreen state.
 *
 * keyframe geometry entries.
 */
export interface TimelineCanvasLayerDrawContext {
  /** Canvas 2D context scaled to CSS pixels. */
  ctx: CanvasRenderingContext2D;
  /** App-owned canvas element being drawn. */
  canvas: HTMLCanvasElement;
  /** Current device pixel ratio used for the backing bitmap. */
  dpr: number;
  /** Canvas width in CSS pixels. */
  width: number;
  /** Canvas height in CSS pixels. */
  height: number;
  /** Current timeline state snapshot. */
  state: TimelineStateSnapshot;
  /** All clip rectangles in track order. */
  clipRects: TimelineClipRect<string>[];
  /** All keyframe rectangles in track order. */
  keyframeRects: TimelineKeyframeRect<string>[];
  /** Viewport-intersecting clips in track order. */
  visibleClips: VisibleTimelineClip<string>[];
  /** Viewport-intersecting keyframes in track order. */
  visibleKeyframes: VisibleTimelineKeyframe<string>[];
  /** Current viewport metrics. */
  viewport: TimelineCanvasLayerViewport;
  /** Reason this draw was scheduled. */
  reason: TimelineCanvasLayerRenderReason;
  /** Schedules another draw, useful after an async asset cache finishes. */
  requestDraw: () => void;
}

/**
 * Draw callback used by custom canvas layers.
 *
 */
export type TimelineCanvasLayerDraw = (context: TimelineCanvasLayerDrawContext) => void;

/**
 * Options for `useTimelineCanvasLayer`.
 *
 * @remarks
 *
 * Use these options for dense app-owned visuals such as waveforms, subtitles,
 * annotations, audio peaks, thumbnail strips, or analysis overlays. Geometry
 * options should match the primary renderer so custom drawings line up with
 * clip and keyframe positions.
 *
 *
 * @see {@link TimelineCanvasLayerDraw}
 * @see {@link https://canvastimeline.com/docs/renderer-customization | Canvas renderer customization}
 */
export interface UseTimelineCanvasLayerOptions extends TimelineClipGeometryOptions {
  /** Draws custom timeline visuals into an app-owned canvas. */
  draw: TimelineCanvasLayerDraw;
  /** Extra pixels around the viewport included in visible clip queries. */
  overscanPixels?: number;
  /** Redraw when only the playhead changes. Defaults to false. */
  redrawOnPlayhead?: boolean;
  /** Clear the canvas before each draw. Defaults to true. */
  clearBeforeDraw?: boolean;
}

/** Imperative handle returned by `useTimelineCanvasLayer`. */
export interface TimelineCanvasLayerHandle {
  /** Schedules a draw on the next animation frame. */
  requestDraw: () => void;
}

function getCanvasBitmapSize(cssSize: number, dpr: number) {
  return Math.ceil(cssSize * dpr);
}

function createViewport(state: TimelineStateSnapshot, maxContentTime: RationalTime, width: number) {
  const safeZoomScale = Math.max(state.zoomScale || 0, 0.1);
  const viewportDurationSeconds = width / safeZoomScale;
  const visibleStartSeconds = clamp(state.scrollLeft / safeZoomScale, 0, toSeconds(maxContentTime));
  const visibleEndSeconds = Math.min(
    toSeconds(maxContentTime),
    visibleStartSeconds + viewportDurationSeconds
  );
  const visibleDurationSeconds = visibleEndSeconds - visibleStartSeconds;

  return {
    scrollLeft: state.scrollLeft,
    zoomScale: safeZoomScale,
    viewportWidth: width,
    viewportDurationTime: fromSeconds(viewportDurationSeconds, maxContentTime.r),
    viewportDurationSeconds,
    visibleStartTime: fromSeconds(visibleStartSeconds, maxContentTime.r),
    visibleEndTime: fromSeconds(visibleEndSeconds, maxContentTime.r),
    visibleDurationTime: fromSeconds(visibleDurationSeconds, maxContentTime.r),
    visibleStartSeconds,
    visibleEndSeconds,
    visibleDurationSeconds,
  };
}

/**
 * Wires an app-owned canvas to timeline geometry and redraw events.
 *
 * Drawing is imperative and scheduled through requestAnimationFrame so dense
 * visual layers do not push scroll or zoom updates through React state.
 *
 * @param canvasRef - Ref for the app-owned canvas element to size and draw.
 * @param options - Drawing callback, geometry overrides, and redraw behavior.
 * @returns Imperative handle for manually scheduling redraws.
 *
 * @example
 * ```tsx
 * import { useRef } from 'react';
 * import { useTimelineCanvasLayer } from '@techsquidtv/canvas-timeline-renderer';
 *
 * export function WaveformLayer() {
 *   const canvasRef = useRef<HTMLCanvasElement>(null);
 *
 *   useTimelineCanvasLayer(canvasRef, {
 *     overscanPixels: 240,
 *     draw: ({ ctx, visibleClips }) => {
 *       ctx.fillStyle = 'rgba(20, 184, 166, 0.35)';
 *
 *       for (const entry of visibleClips) {
 *         ctx.fillRect(entry.x, entry.y + entry.height / 2, entry.width, 2);
 *       }
 *     },
 *   });
 *
 *   return <canvas ref={canvasRef} className="timeline-custom-canvas-layer" />;
 * }
 * ```
 *
 * @see {@link TimelineCanvasLayerDrawContext}
 * @see {@link TimelineCanvasLayer}
 * @see {@link https://canvastimeline.com/docs/renderer-customization | Canvas renderer customization}
 */
export function useTimelineCanvasLayer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  options: UseTimelineCanvasLayerOptions
): TimelineCanvasLayerHandle {
  const { engine } = useTimeline();
  const drawRef = useRef(options.draw);
  const optionsRef = useRef(options);
  const requestDrawRef = useRef<(reason: TimelineCanvasLayerRenderReason) => void>(() => undefined);

  useEffect(() => {
    drawRef.current = options.draw;
    optionsRef.current = options;
    requestDrawRef.current('options');
  }, [options]);

  const requestDraw = useCallback(() => {
    requestDrawRef.current('manual');
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    let frame: number | null = null;
    let drawReason: TimelineCanvasLayerRenderReason = 'init';
    let width = 0;
    let height = 0;
    let dpr = 1;

    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      width = Math.max(0, rect.width);
      height = Math.max(0, rect.height);
      const bitmapWidth = getCanvasBitmapSize(width, dpr);
      const bitmapHeight = getCanvasBitmapSize(height, dpr);

      if (canvas.width !== bitmapWidth) {
        canvas.width = bitmapWidth;
      }
      if (canvas.height !== bitmapHeight) {
        canvas.height = bitmapHeight;
      }
    };

    const drawFrame = () => {
      frame = null;
      measure();

      const latest = optionsRef.current;
      const state = engine.getState();
      const clipGeometry = {
        collapsedTrackHeight: latest.collapsedTrackHeight,
        edgeThreshold: latest.edgeThreshold,
        rulerHeight: latest.rulerHeight,
        touchEdgeThreshold: latest.touchEdgeThreshold,
        trackHeight: latest.trackHeight,
      };
      let clipRects: TimelineClipRect<string>[] | null = null;
      let keyframeRects: TimelineKeyframeRect<string>[] | null = null;
      let visibleClips: VisibleTimelineClip<string>[] | null = null;
      let visibleKeyframes: VisibleTimelineKeyframe<string>[] | null = null;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      if (latest.clearBeforeDraw ?? true) {
        ctx.clearRect(0, 0, width, height);
      }

      drawRef.current({
        ctx,
        canvas,
        dpr,
        width,
        height,
        state,
        get clipRects() {
          clipRects ??= engine.geometry.getClipRects(clipGeometry);
          return clipRects;
        },
        get keyframeRects() {
          keyframeRects ??= engine.keyframes.getKeyframeRects(clipGeometry);
          return keyframeRects;
        },
        get visibleClips() {
          visibleClips ??= engine.geometry.getVisibleTimelineClips({
            ...clipGeometry,
            overscanPixels: latest.overscanPixels,
            viewportHeight: height,
            viewportWidth: width,
          });
          return visibleClips;
        },
        get visibleKeyframes() {
          visibleKeyframes ??= engine.keyframes.getVisibleKeyframes({
            ...clipGeometry,
            overscanPixels: latest.overscanPixels,
            viewportHeight: height,
            viewportWidth: width,
          });
          return visibleKeyframes;
        },
        viewport: createViewport(state, engine.maxContentTime, width),
        reason: drawReason,
        requestDraw,
      });
    };

    const scheduleDraw = (reason: TimelineCanvasLayerRenderReason) => {
      drawReason = reason;
      if (frame !== null) {
        return;
      }
      frame = window.requestAnimationFrame(drawFrame);
    };

    requestDrawRef.current = scheduleDraw;
    measure();
    scheduleDraw('init');

    const resizeObserver = new ResizeObserver(() => {
      measure();
      scheduleDraw('resize');
    });
    resizeObserver.observe(canvas);

    const unsubScroll = engine.on('scroll:change', () => scheduleDraw('state'));
    const unsubZoom = engine.on('zoom:change', () => scheduleDraw('state'));
    const unsubRender = engine.on('render', () => scheduleDraw('state'));
    const unsubViewport = engine.on('viewport:resize', () => scheduleDraw('resize'));
    const unsubPlayhead =
      (optionsRef.current.redrawOnPlayhead ?? false)
        ? engine.on('playhead:scrub', () => scheduleDraw('playhead'))
        : () => undefined;

    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      requestDrawRef.current = () => undefined;
      resizeObserver.disconnect();
      unsubScroll();
      unsubZoom();
      unsubRender();
      unsubViewport();
      unsubPlayhead();
    };
  }, [canvasRef, engine, options.redrawOnPlayhead, requestDraw]);

  return { requestDraw };
}
