import { toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { getActiveWidth, secondsToX } from '#renderer/render/geometry';
import type { RenderContext } from '#renderer/render/types';

function findTrackBand(renderContext: RenderContext, trackId: string) {
  const { state, theme } = renderContext;
  let y = theme.metrics.rulerHeight - state.scrollTop;

  for (const track of state.tracks) {
    const height = Math.floor(track.collapsed ? 24 : (track.height ?? theme.metrics.trackHeight));
    if (track.id === trackId) {
      return { y, height };
    }
    y += height;
  }

  return null;
}

function drawTrackBand(
  renderContext: RenderContext,
  trackId: string,
  fill: string,
  stroke?: string
) {
  const { ctx, height, theme } = renderContext;
  const width = getActiveWidth(renderContext);
  const band = findTrackBand(renderContext, trackId);
  if (!band) {
    return;
  }

  const y = Math.max(theme.metrics.rulerHeight, band.y);
  const bottom = Math.min(height, band.y + band.height);
  if (bottom <= y) {
    return;
  }

  ctx.fillStyle = fill;
  ctx.fillRect(0, y, width, bottom - y);

  if (stroke) {
    ctx.fillStyle = stroke;
    ctx.fillRect(0, y, width, 1);
    ctx.fillRect(0, bottom - 1, width, 1);
  }
}

export function drawClipDropFeedback(renderContext: RenderContext) {
  const { state, theme } = renderContext;
  const feedback = state.clipDropFeedback;

  if (!feedback.activeClipId) {
    return;
  }

  if (feedback.activeTargetTrackId) {
    drawTrackBand(
      renderContext,
      feedback.activeTargetTrackId,
      theme.colors.feedback.dropTarget,
      theme.colors.feedback.dropTargetBorder
    );
  }

  if (
    feedback.hoveredTrackId &&
    feedback.valid === false &&
    feedback.hoveredTrackId !== feedback.activeTargetTrackId
  ) {
    drawTrackBand(renderContext, feedback.hoveredTrackId, theme.colors.feedback.dropTargetInvalid);
  }
}

export function drawSnapLines({ ctx, state, width, height, theme }: RenderContext) {
  if (!state.snapFeedback.lines.length) {
    return;
  }

  ctx.fillStyle = theme.colors.feedback.snapLine;
  ctx.beginPath();
  state.snapFeedback.lines.forEach((snapTime: number) => {
    const snapX = Math.floor(snapTime * state.zoomScale - state.scrollLeft);
    if (snapX >= 0 && snapX <= width) {
      ctx.rect(snapX, theme.metrics.rulerHeight, 1, height - theme.metrics.rulerHeight);
    }
  });
  ctx.fill();
}

export function drawInOutPoints(renderContext: RenderContext) {
  const { ctx, state, width, height, theme } = renderContext;

  if (state.inPoint === undefined && state.outPoint === undefined) {
    return;
  }

  const inTime = state.inPoint !== undefined ? toSeconds(state.inPoint) : 0;
  const outTime =
    state.outPoint !== undefined ? toSeconds(state.outPoint) : Number.MAX_SAFE_INTEGER;

  if (inTime >= outTime) {
    return;
  }

  const realInX = secondsToX(renderContext, inTime);
  const realOutX = secondsToX(renderContext, outTime);
  const inX = Math.max(0, realInX);
  const outX = Math.min(width, realOutX);

  if (outX <= 0 || inX >= width) {
    return;
  }

  ctx.fillStyle = theme.colors.feedback.inOutArea;
  ctx.fillRect(inX, theme.metrics.rulerHeight, outX - inX, height - theme.metrics.rulerHeight);

  if (!renderContext.options.showInOutBoundaryLines) {
    return;
  }

  ctx.fillStyle = theme.colors.feedback.inOutBorder;
  if (state.inPoint !== undefined && realInX >= 0 && realInX <= width) {
    ctx.fillRect(realInX, 0, 2, height);
  }

  if (state.outPoint !== undefined && realOutX >= 0 && realOutX <= width) {
    ctx.fillRect(realOutX - 2, 0, 2, height);
  }
}
