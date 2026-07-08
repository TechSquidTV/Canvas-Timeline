import React, { useEffect, useRef } from 'react';
import { useTimeline } from '@techsquidtv/canvas-timeline-react';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import type {
  TimelineKeyframePropertyId,
  TimelineKeyframeRenderGeometry,
} from '@techsquidtv/canvas-timeline-core';
import type { TimelineRenderOptions, TimelineRulerOptions } from '#renderer/render/types';
import {
  resolveTimelineRendererThemeFromElement,
  type TimelineRendererTheme,
  type TimelineRendererThemeInput,
} from '#renderer/theme';

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
  reason: 'worker-unavailable' | 'offscreen-unavailable' | 'worker-failed' | 'invalid-options';
  /** Human-readable diagnostic suitable for logs or app UI. */
  message: string;
  /** Original browser error when available. */
  cause?: Error;
}

interface CanvasRendererWorkerRenderErrorMessage {
  type: 'RENDER_ERROR';
  error: {
    message: string;
    name?: string;
    stack?: string;
  };
}

interface CanvasRendererWorkerStatsMessage {
  type: 'RENDER_STATS';
  stats: CanvasRendererStats;
}

type CanvasRendererWorkerMessage =
  | CanvasRendererWorkerRenderErrorMessage
  | CanvasRendererWorkerStatsMessage;

function getCanvasBitmapSize(cssSize: number, dpr: number) {
  return Math.ceil(cssSize * dpr);
}

function toCanvasRendererError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

function createWorkerRenderErrorCause(
  error: CanvasRendererWorkerRenderErrorMessage['error']
): Error {
  const cause = new Error(error.message);
  cause.name = error.name ?? 'CanvasRendererWorkerError';
  cause.stack = error.stack;
  return cause;
}

/**
 * Shared props for the worker-backed canvas renderer.
 */
export interface CanvasRendererBaseProps extends Omit<
  TimelineRenderOptions,
  'keyframeGeometry' | 'showKeyframes'
> {
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
 * Keyframe rendering props for the worker-backed canvas renderer.
 */
export type CanvasRendererKeyframeProps =
  | {
      /** Draw keyframe segments and handles inside visible clips. Requires `keyframeProperty`. */
      showKeyframes?: true;
      /** Keyframe property drawn by the canvas renderer when keyframes are visible. */
      keyframeProperty: TimelineKeyframePropertyId;
    }
  | {
      /** Disable keyframe segment drawing. */
      showKeyframes?: false;
      /** Optional property metadata retained for app-controlled renderer toggles. */
      keyframeProperty?: TimelineKeyframePropertyId;
    };

/**
 * Props for the timeline canvas renderer layer.
 */
export type CanvasRendererProps = CanvasRendererBaseProps & CanvasRendererKeyframeProps;

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
  showKeyframes,
  keyframeProperty,
  showRulerLabels = true,
  showSnapLines = true,
  ruler,
  theme,
  themeKey,
  onRenderError,
  onRenderStats,
}: CanvasRendererProps) {
  const shouldShowKeyframes = showKeyframes ?? keyframeProperty !== undefined;
  const containerRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const onRenderErrorRef = useRef(onRenderError);
  const onRenderStatsRef = useRef(onRenderStats);
  const resolvedThemeRef = useRef<TimelineRendererTheme | null>(null);
  const containerSizeRef = useRef({ width: 0, height: 0 });
  const renderOptionsRef = useRef({
    showClipLabels,
    showClipDropFeedback,
    showClips,
    showInOutBoundaryLines,
    showInOutPoints,
    showKeyframes: shouldShowKeyframes,
    keyframeProperty,
    showRulerLabels,
    showSnapLines,
    ruler,
    theme,
    themeKey,
  });
  const { engine } = useTimeline();

  const reportRenderError = React.useCallback((error: CanvasRendererError) => {
    onRenderErrorRef.current?.(error);
  }, []);

  const createKeyframeGeometry = React.useCallback(():
    | TimelineKeyframeRenderGeometry
    | undefined => {
    const latest = renderOptionsRef.current;
    if (!latest.showKeyframes) {
      return undefined;
    }
    if (latest.keyframeProperty === undefined) {
      reportRenderError({
        reason: 'invalid-options',
        message: 'CanvasRenderer keyframe drawing requires a keyframeProperty.',
      });
      return undefined;
    }
    if (!engine.hasKeyframeProperty(latest.keyframeProperty)) {
      reportRenderError({
        reason: 'invalid-options',
        message: `CanvasRenderer keyframe property "${latest.keyframeProperty}" is not registered with the engine.`,
      });
      return undefined;
    }

    const resolvedTheme = resolvedThemeRef.current;
    if (resolvedTheme === null) {
      return undefined;
    }

    try {
      return engine.getKeyframeRenderGeometry({
        property: latest.keyframeProperty,
        rulerHeight: resolvedTheme.metrics.rulerHeight,
        trackHeight: resolvedTheme.metrics.trackHeight,
        viewportHeight: containerSizeRef.current.height,
        viewportWidth: containerSizeRef.current.width,
      });
    } catch (geometryError: unknown) {
      reportRenderError({
        reason: 'invalid-options',
        message: 'CanvasRenderer could not prepare keyframe geometry.',
        cause: toCanvasRendererError(geometryError),
      });
      return undefined;
    }
  }, [engine, reportRenderError]);

  const createRenderOptions = React.useCallback(
    (container: Element): TimelineRenderOptions => {
      const latest = renderOptionsRef.current;
      const resolvedTheme = resolveTimelineRendererThemeFromElement(container, latest.theme);
      resolvedThemeRef.current = resolvedTheme;
      const keyframeGeometry = createKeyframeGeometry();
      return {
        showClipLabels: latest.showClipLabels,
        showClipDropFeedback: latest.showClipDropFeedback,
        showClips: latest.showClips,
        showInOutBoundaryLines: latest.showInOutBoundaryLines,
        showInOutPoints: latest.showInOutPoints,
        showKeyframes: latest.showKeyframes && keyframeGeometry !== undefined,
        keyframeGeometry,
        showRulerLabels: latest.showRulerLabels,
        showSnapLines: latest.showSnapLines,
        ruler: latest.ruler,
        theme: resolvedTheme,
      };
    },
    [createKeyframeGeometry]
  );

  useEffect(() => {
    renderOptionsRef.current = {
      showClipLabels,
      showClipDropFeedback,
      showClips,
      showInOutBoundaryLines,
      showInOutPoints,
      showKeyframes: shouldShowKeyframes,
      keyframeProperty,
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
    shouldShowKeyframes,
    keyframeProperty,
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
    containerSizeRef.current = {
      width: Math.max(0, rect.width),
      height: Math.max(0, rect.height),
    };
    canvas.width = getCanvasBitmapSize(rect.width, dpr);
    canvas.height = getCanvasBitmapSize(rect.height, dpr);

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
      worker = new Worker(new URL('./worker', import.meta.url), { type: 'module' });
    } catch (workerError: unknown) {
      reportRenderError({
        reason: 'worker-failed',
        message: 'CanvasRenderer worker could not be created.',
        cause: toCanvasRendererError(workerError),
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
    workerRef.current.onmessage = (event: MessageEvent<CanvasRendererWorkerMessage>) => {
      if (event.data.type === 'RENDER_STATS') {
        onRenderStatsRef.current?.(event.data.stats);
        return;
      }

      if (event.data.type === 'RENDER_ERROR') {
        reportRenderError({
          reason: 'worker-failed',
          message: event.data.error.message || 'CanvasRenderer worker render failed.',
          cause: createWorkerRenderErrorCause(event.data.error),
        });
      }
    };

    let offscreen: OffscreenCanvas;
    try {
      offscreen = canvas.transferControlToOffscreen();
    } catch (transferError: unknown) {
      reportRenderError({
        reason: 'offscreen-unavailable',
        message: 'CanvasRenderer could not transfer its canvas to an OffscreenCanvas.',
        cause: toCanvasRendererError(transferError),
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
        keyframesRequested: renderOptionsRef.current.showKeyframes,
        diagnosticsEnabled: Boolean(onRenderStatsRef.current),
      },
      [offscreen]
    );

    const handleRender = () => {
      workerRef.current?.postMessage({
        type: 'UPDATE_STATE',
        state: engine.getState(),
        keyframeGeometry: createKeyframeGeometry(),
        keyframesRequested: renderOptionsRef.current.showKeyframes,
      });
    };
    const handlePlayhead = (time: RationalTime) => {
      workerRef.current?.postMessage({ type: 'UPDATE_PLAYHEAD', time });
    };

    const unsubRender = engine.on('render', handleRender);
    const unsubPlayhead = engine.on('playhead:scrub', handlePlayhead);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const currentDpr = window.devicePixelRatio || 1;
        containerSizeRef.current = {
          width: Math.max(0, entry.contentRect.width),
          height: Math.max(0, entry.contentRect.height),
        };
        workerRef.current?.postMessage({
          type: 'RESIZE',
          width: getCanvasBitmapSize(entry.contentRect.width, currentDpr),
          height: getCanvasBitmapSize(entry.contentRect.height, currentDpr),
          dpr: currentDpr,
          keyframeGeometry: createKeyframeGeometry(),
          keyframesRequested: renderOptionsRef.current.showKeyframes,
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
  }, [engine, className, createKeyframeGeometry, createRenderOptions, reportRenderError]);

  useEffect(() => {
    if (!containerRef.current || !workerRef.current) {
      return;
    }

    workerRef.current.postMessage({
      type: 'UPDATE_OPTIONS',
      options: createRenderOptions(containerRef.current),
      keyframesRequested: renderOptionsRef.current.showKeyframes,
    });
  }, [
    showClipLabels,
    showClipDropFeedback,
    showClips,
    showInOutBoundaryLines,
    showInOutPoints,
    shouldShowKeyframes,
    keyframeProperty,
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
