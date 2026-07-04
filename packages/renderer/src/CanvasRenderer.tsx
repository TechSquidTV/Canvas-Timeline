import React, { useEffect, useRef } from 'react';
import { useTimeline } from '@techsquidtv/canvas-timeline-react';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import type { TimelineRenderOptions, TimelineRulerOptions } from './render/types';
import { resolveTimelineRendererThemeFromElement, type TimelineRendererThemeInput } from './theme';

/**
 * Reason the worker rendered a new canvas timeline frame.
 */
export type CanvasRendererRenderReason = 'init' | 'state' | 'playhead' | 'options' | 'resize';

/**
 * Diagnostic timing details emitted after a canvas renderer draw pass.
 */
export interface CanvasRendererStats {
  /** Change that triggered the render pass. */
  reason: CanvasRendererRenderReason;
  /** Worker timestamp when drawing began. */
  startedAt: number;
  /** Worker timestamp when drawing completed. */
  completedAt: number;
  /** Total draw duration in milliseconds. */
  drawDurationMs: number;
}

/** Renderer setup or worker failure details. */
export interface CanvasRendererError {
  /** Short machine-readable failure category. */
  reason: 'worker-unavailable' | 'offscreen-unavailable' | 'worker-failed';
  /** Human-readable diagnostic suitable for logs or app UI. */
  message: string;
  /** Original browser error when available. */
  cause?: Error;
}

function getCanvasBitmapSize(cssSize: number, dpr: number) {
  return Math.ceil(cssSize * dpr);
}

/**
 * Props for the timeline canvas renderer layer.
 */
export interface CanvasRendererProps extends TimelineRenderOptions {
  /** Additional class names applied to the generated canvas element. */
  className?: string;
  /** Draw magnetic snapping guide lines on the canvas layer. */
  showSnapLines?: boolean;
  /** Draw cross-track clip drop feedback on the canvas layer. */
  showClipDropFeedback?: boolean;
  /** Draw the in/out range fill on the canvas layer. */
  showInOutPoints?: boolean;
  /** Draw canvas-painted in/out boundary lines for renderer-only compositions. */
  showInOutBoundaryLines?: boolean;

  /** Draw built-in clip bodies and labels on the canvas layer. */
  showClips?: boolean;
  /** Draw text labels inside visible clips. */
  showClipLabels?: boolean;
  /** Draw keyframe curves and handles inside visible clips. */
  showKeyframes?: boolean;
  /** Draw text labels on ruler ticks. */
  showRulerLabels?: boolean;
  /** Canvas ruler tick and label configuration. */
  ruler?: TimelineRulerOptions;
  /** Canvas renderer theme overrides. CSS timeline variables are resolved before these overrides. */
  theme?: TimelineRendererThemeInput;
  /** Changes when CSS theme variables should be re-read, such as dark/light mode switches. */
  themeKey?: string | number;
  /** Receives worker draw timing diagnostics when provided. */
  onRenderStats?: (stats: CanvasRendererStats) => void;
  /** Receives setup and worker failures that prevent canvas rendering. */
  onRenderError?: (error: CanvasRendererError) => void;
}

/**
 * Renders the timeline canvas layer using an offscreen worker.
 *
 * @param props - Renderer configuration.
 */
export function CanvasRenderer({
  className = '',
  showClipLabels = true,
  showClipDropFeedback = true,
  showClips = true,
  showInOutBoundaryLines = false,
  showInOutPoints = true,
  showKeyframes = true,
  showRulerLabels = true,
  showSnapLines = true,
  ruler,
  theme,
  themeKey,
  onRenderError,
  onRenderStats,
}: CanvasRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const onRenderErrorRef = useRef(onRenderError);
  const onRenderStatsRef = useRef(onRenderStats);
  const renderOptionsRef = useRef({
    showClipLabels,
    showClipDropFeedback,
    showClips,
    showInOutBoundaryLines,
    showInOutPoints,
    showKeyframes,
    showRulerLabels,
    showSnapLines,
    ruler,
    theme,
    themeKey,
  });
  const { engine } = useTimeline();

  const createRenderOptions = React.useCallback((container: Element): TimelineRenderOptions => {
    const latest = renderOptionsRef.current;
    return {
      showClipLabels: latest.showClipLabels,
      showClipDropFeedback: latest.showClipDropFeedback,
      showClips: latest.showClips,
      showInOutBoundaryLines: latest.showInOutBoundaryLines,
      showInOutPoints: latest.showInOutPoints,
      showKeyframes: latest.showKeyframes,
      showRulerLabels: latest.showRulerLabels,
      showSnapLines: latest.showSnapLines,
      ruler: latest.ruler,
      theme: resolveTimelineRendererThemeFromElement(container, latest.theme),
    };
  }, []);

  useEffect(() => {
    renderOptionsRef.current = {
      showClipLabels,
      showClipDropFeedback,
      showClips,
      showInOutBoundaryLines,
      showInOutPoints,
      showKeyframes,
      showRulerLabels,
      showSnapLines,
      ruler,
      theme,
      themeKey,
    };
  }, [
    showClipLabels,
    showClipDropFeedback,
    showClips,
    showInOutBoundaryLines,
    showInOutPoints,
    showKeyframes,
    showRulerLabels,
    showSnapLines,
    ruler,
    theme,
    themeKey,
  ]);

  useEffect(() => {
    onRenderErrorRef.current = onRenderError;
  }, [onRenderError]);

  useEffect(() => {
    onRenderStatsRef.current = onRenderStats;
    workerRef.current?.postMessage({
      type: 'SET_DIAGNOSTICS',
      enabled: Boolean(onRenderStats),
    });
  }, [onRenderStats]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const container = containerRef.current;
    const canvas = document.createElement('canvas');
    canvas.className = `timeline-canvas ${className}`.trim();
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      display: 'block',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    });
    container.appendChild(canvas);

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = getCanvasBitmapSize(rect.width, dpr);
    canvas.height = getCanvasBitmapSize(rect.height, dpr);

    const reportRenderError = (error: CanvasRendererError) => {
      onRenderErrorRef.current?.(error);
    };

    if (typeof Worker === 'undefined') {
      reportRenderError({
        reason: 'worker-unavailable',
        message: 'CanvasRenderer requires browser Worker support.',
      });
      container.removeChild(canvas);
      return;
    }

    if (typeof canvas.transferControlToOffscreen !== 'function') {
      reportRenderError({
        reason: 'offscreen-unavailable',
        message: 'CanvasRenderer requires HTMLCanvasElement.transferControlToOffscreen support.',
      });
      container.removeChild(canvas);
      return;
    }

    let worker: Worker;
    try {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    } catch (workerError: unknown) {
      reportRenderError({
        reason: 'worker-failed',
        message: 'CanvasRenderer worker could not be created.',
        cause: workerError instanceof Error ? workerError : new Error(String(workerError)),
      });
      container.removeChild(canvas);
      return;
    }

    workerRef.current = worker;
    workerRef.current.onerror = (event: ErrorEvent) => {
      reportRenderError({
        reason: 'worker-failed',
        message: event.message || 'CanvasRenderer worker failed.',
        ...(event.error instanceof Error ? { cause: event.error } : {}),
      });
    };
    workerRef.current.onmessage = (event: MessageEvent) => {
      if (event.data?.type !== 'RENDER_STATS') {
        return;
      }

      onRenderStatsRef.current?.(event.data.stats);
    };

    let offscreen: OffscreenCanvas;
    try {
      offscreen = canvas.transferControlToOffscreen();
    } catch (transferError: unknown) {
      reportRenderError({
        reason: 'offscreen-unavailable',
        message: 'CanvasRenderer could not transfer its canvas to an OffscreenCanvas.',
        cause: transferError instanceof Error ? transferError : new Error(String(transferError)),
      });
      workerRef.current.terminate();
      workerRef.current = null;
      container.removeChild(canvas);
      return;
    }

    workerRef.current.postMessage(
      {
        type: 'INIT',
        canvas: offscreen,
        state: engine.getState(),
        dpr,
        options: createRenderOptions(container),
        diagnosticsEnabled: Boolean(onRenderStatsRef.current),
      },
      [offscreen]
    );

    const handleRender = () => {
      workerRef.current?.postMessage({ type: 'UPDATE_STATE', state: engine.getState() });
    };
    const handlePlayhead = (time: RationalTime) => {
      workerRef.current?.postMessage({ type: 'UPDATE_PLAYHEAD', time });
    };

    const unsubRender = engine.on('render', handleRender);
    const unsubPlayhead = engine.on('playhead:scrub', handlePlayhead);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const currentDpr = window.devicePixelRatio || 1;
        workerRef.current?.postMessage({
          type: 'RESIZE',
          width: getCanvasBitmapSize(entry.contentRect.width, currentDpr),
          height: getCanvasBitmapSize(entry.contentRect.height, currentDpr),
          dpr: currentDpr,
        });
      }
    });

    resizeObserver.observe(container);

    return () => {
      unsubRender();
      unsubPlayhead();
      workerRef.current?.terminate();
      resizeObserver.disconnect();
      if (container.contains(canvas)) {
        container.removeChild(canvas);
      }
    };
  }, [engine, className, createRenderOptions]);

  useEffect(() => {
    if (!containerRef.current || !workerRef.current) {
      return;
    }

    workerRef.current.postMessage({
      type: 'UPDATE_OPTIONS',
      options: createRenderOptions(containerRef.current),
    });
  }, [
    showClipLabels,
    showClipDropFeedback,
    showClips,
    showInOutBoundaryLines,
    showInOutPoints,
    showKeyframes,
    showRulerLabels,
    showSnapLines,
    ruler,
    theme,
    themeKey,
    createRenderOptions,
  ]);

  return (
    <div
      ref={containerRef}
      className="timeline-canvas-layer"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}
