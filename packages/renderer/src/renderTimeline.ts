import type { TimelineState } from '@techsquidtv/canvas-timeline-core';
import { createTimelineRendererTheme } from './theme';
import { drawClipDropFeedback, drawInOutPoints, drawSnapLines } from './render/feedback';
import { getActiveWidth } from './render/geometry';
import { drawMarkers, drawRuler } from './render/ruler';
import { drawTracks } from './render/tracks';
import type {
  RenderContext,
  ResolvedTimelineRenderOptions,
  TimelineRenderOptions,
} from './render/types';

const defaultRenderOptions: Omit<ResolvedTimelineRenderOptions, 'theme'> = {
  showClips: true,
  showClipLabels: true,
  showClipDropFeedback: true,
  showInOutBoundaryLines: false,
  showInOutPoints: true,
  showKeyframes: true,
  showRulerLabels: true,
  showSnapLines: true,
};

export function renderTimeline(
  ctx: OffscreenCanvasRenderingContext2D,
  canvas: OffscreenCanvas,
  state: TimelineState,
  dpr: number,
  options: TimelineRenderOptions = {}
) {
  const renderTheme = createTimelineRendererTheme(options.theme);
  const resolvedOptions: ResolvedTimelineRenderOptions = {
    ...defaultRenderOptions,
    ...options,
    theme: renderTheme,
  };
  const renderContext: RenderContext = {
    ctx,
    state,
    width: canvas.width / dpr,
    height: canvas.height / dpr,
    options: resolvedOptions,
    theme: renderTheme,
  };

  ctx.resetTransform();
  ctx.scale(dpr, dpr);

  drawBackground(renderContext);
  drawRuler(renderContext);
  drawStructuralBorders(renderContext);
  drawMarkers(renderContext);
  if (renderContext.options.showClipDropFeedback) {
    drawClipDropFeedback(renderContext);
  }
  drawTracks(renderContext);
  if (renderContext.options.showSnapLines) {
    drawSnapLines(renderContext);
  }
  if (renderContext.options.showInOutPoints) {
    drawInOutPoints(renderContext);
  }
}

function drawStructuralBorders(renderContext: RenderContext) {
  const { ctx, height, theme } = renderContext;
  const activeWidth = getActiveWidth(renderContext);
  const borderWidth = theme.metrics.borderWidth;

  if (activeWidth <= 0 || borderWidth <= 0) {
    return;
  }

  const borderY = Math.max(0, theme.metrics.rulerHeight - borderWidth);
  if (borderY >= height) {
    return;
  }

  ctx.fillStyle = theme.colors.border;
  ctx.fillRect(0, borderY, activeWidth, borderWidth);
}

function drawBackground(renderContext: RenderContext) {
  const { ctx, width, height, theme } = renderContext;
  const activeWidth = getActiveWidth(renderContext);

  ctx.fillStyle = theme.colors.background;
  ctx.fillRect(0, 0, activeWidth, height);

  if (activeWidth < width) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(activeWidth, 0, width - activeWidth, height);
  }
}
