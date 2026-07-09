import type { TimelineState } from '@techsquidtv/canvas-timeline-core';
import { renderTimeline } from '#renderer/renderTimeline';
import type { CanvasRendererRenderReason, CanvasRendererStats } from '#renderer/CanvasRenderer';
import type { TimelineRenderOptions } from '#renderer/render/types';

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let state: TimelineState | null = null;
let renderRequested = false;
let renderReason: CanvasRendererRenderReason = 'init';
let diagnosticsEnabled = false;
let dpr = 1;
let options: TimelineRenderOptions = {};
let keyframesRequested = false;

type CanvasRendererWorkerMessage =
  | {
      type: 'INIT';
      canvas: OffscreenCanvas;
      state: TimelineState;
      dpr?: number;
      options?: TimelineRenderOptions;
      keyframesRequested?: boolean;
      diagnosticsEnabled?: boolean;
    }
  | {
      type: 'UPDATE_STATE';
      state: TimelineState;
      keyframeGeometry?: TimelineRenderOptions['keyframeGeometry'];
      keyframesRequested?: boolean;
    }
  | {
      type: 'UPDATE_OPTIONS';
      options?: TimelineRenderOptions;
      keyframesRequested?: boolean;
    }
  | {
      type: 'UPDATE_PLAYHEAD';
      time: TimelineState['playheadTime'];
    }
  | {
      type: 'RESIZE';
      width: number;
      height: number;
      dpr?: number;
      keyframeGeometry?: TimelineRenderOptions['keyframeGeometry'];
      keyframesRequested?: boolean;
    }
  | {
      type: 'SET_DIAGNOSTICS';
      enabled: boolean;
    };

interface CanvasRendererWorkerRenderError {
  message: string;
  name?: string;
  stack?: string;
}

type CanvasRendererWorkerResponse =
  | {
      type: 'RENDER_STATS';
      stats: CanvasRendererStats;
    }
  | {
      type: 'RENDER_ERROR';
      error: CanvasRendererWorkerRenderError;
    };

self.onmessage = (event: MessageEvent<CanvasRendererWorkerMessage>) => {
  const message = event.data;
  if (message.type === 'INIT') {
    canvas = message.canvas;
    ctx = canvas.getContext('2d', { alpha: false });
    state = message.state;
    dpr = message.dpr || 1;
    keyframesRequested = message.keyframesRequested ?? Boolean(message.options?.showKeyframes);
    options = {
      ...message.options,
      showKeyframes: keyframesRequested && message.options?.keyframeGeometry !== undefined,
    };
    diagnosticsEnabled = Boolean(message.diagnosticsEnabled);
    requestRender('init');
  } else if (message.type === 'UPDATE_STATE') {
    state = message.state;
    if (message.keyframesRequested !== undefined) {
      keyframesRequested = message.keyframesRequested;
    }
    updateOptionsKeyframeGeometry(message);
    requestRender('state');
  } else if (message.type === 'UPDATE_OPTIONS') {
    keyframesRequested = message.keyframesRequested ?? Boolean(message.options?.showKeyframes);
    options = {
      ...message.options,
      showKeyframes: keyframesRequested && message.options?.keyframeGeometry !== undefined,
    };
    requestRender('options');
  } else if (message.type === 'UPDATE_PLAYHEAD') {
    if (state) {
      state.playheadTime = message.time;
      requestRender('playhead');
    }
  } else if (message.type === 'RESIZE') {
    if (canvas) {
      canvas.width = message.width;
      canvas.height = message.height;
      dpr = message.dpr || 1;
      if (message.keyframesRequested !== undefined) {
        keyframesRequested = message.keyframesRequested;
      }
      updateOptionsKeyframeGeometry(message);
      requestRender('resize');
    }
  } else if (message.type === 'SET_DIAGNOSTICS') {
    diagnosticsEnabled = message.enabled;
  }
};

function requestRender(reason: CanvasRendererRenderReason) {
  renderReason = reason;
  if (!renderRequested) {
    renderRequested = true;
    requestAnimationFrame(draw);
  }
}

function updateOptionsKeyframeGeometry(message: {
  keyframeGeometry?: TimelineRenderOptions['keyframeGeometry'];
}) {
  const nextKeyframeGeometry =
    'keyframeGeometry' in message ? message.keyframeGeometry : options.keyframeGeometry;
  options = {
    ...options,
    ...('keyframeGeometry' in message ? { keyframeGeometry: message.keyframeGeometry } : {}),
    showKeyframes: keyframesRequested && nextKeyframeGeometry !== undefined,
  };
}

function draw() {
  renderRequested = false;
  if (!ctx || !canvas || !state) {
    return;
  }

  const startedAt = performance.now();
  try {
    renderTimeline(ctx, canvas, state, dpr, options);
  } catch (renderError: unknown) {
    self.postMessage({
      type: 'RENDER_ERROR',
      error: serializeRenderError(renderError),
    } satisfies CanvasRendererWorkerResponse);
    return;
  }
  const completedAt = performance.now();

  if (diagnosticsEnabled) {
    const stats: CanvasRendererStats = {
      reason: renderReason,
      startedAt,
      completedAt,
      drawDurationMs: completedAt - startedAt,
    };
    self.postMessage({ type: 'RENDER_STATS', stats } satisfies CanvasRendererWorkerResponse);
  }
}

function serializeRenderError(error: unknown): CanvasRendererWorkerRenderError {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}
