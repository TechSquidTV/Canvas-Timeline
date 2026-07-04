import type { TimelineState } from '@techsquidtv/canvas-timeline-core';
import { renderTimeline } from './renderTimeline';
import type { CanvasRendererRenderReason, CanvasRendererStats } from './CanvasRenderer';
import type { TimelineRenderOptions } from './render/types';

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let state: TimelineState | null = null;
let renderRequested = false;
let renderReason: CanvasRendererRenderReason = 'init';
let diagnosticsEnabled = false;
let dpr = 1;
let options: TimelineRenderOptions = {};

self.onmessage = (e: MessageEvent) => {
  if (e.data.type === 'INIT') {
    canvas = e.data.canvas;
    ctx = canvas?.getContext('2d', { alpha: false }) as OffscreenCanvasRenderingContext2D;
    state = e.data.state;
    dpr = e.data.dpr || 1;
    options = e.data.options || {};
    diagnosticsEnabled = Boolean(e.data.diagnosticsEnabled);
    requestRender('init');
  } else if (e.data.type === 'UPDATE_STATE') {
    state = e.data.state;
    requestRender('state');
  } else if (e.data.type === 'UPDATE_OPTIONS') {
    options = e.data.options || {};
    requestRender('options');
  } else if (e.data.type === 'UPDATE_PLAYHEAD') {
    if (state) {
      state.playheadTime = e.data.time;
      requestRender('playhead');
    }
  } else if (e.data.type === 'RESIZE') {
    if (canvas) {
      canvas.width = e.data.width;
      canvas.height = e.data.height;
      dpr = e.data.dpr || 1;
      requestRender('resize');
    }
  } else if (e.data.type === 'SET_DIAGNOSTICS') {
    diagnosticsEnabled = Boolean(e.data.enabled);
  }
};

function requestRender(reason: CanvasRendererRenderReason) {
  renderReason = reason;
  if (!renderRequested) {
    renderRequested = true;
    requestAnimationFrame(draw);
  }
}

function draw() {
  renderRequested = false;
  if (!ctx || !canvas || !state) {
    return;
  }

  const startedAt = performance.now();
  renderTimeline(ctx, canvas, state, dpr, options);
  const completedAt = performance.now();

  if (diagnosticsEnabled) {
    const stats: CanvasRendererStats = {
      reason: renderReason,
      startedAt,
      completedAt,
      drawDurationMs: completedAt - startedAt,
    };
    self.postMessage({ type: 'RENDER_STATS', stats });
  }
}
