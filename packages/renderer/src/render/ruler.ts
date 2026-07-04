import { getTimelineRulerTicks, type Marker } from '@techsquidtv/canvas-timeline-core';
import { toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { getActiveWidth, secondsToX } from './geometry';
import type { RenderContext } from './types';

function drawRulerTicks(renderContext: RenderContext) {
  const { ctx, state, width, theme } = renderContext;
  const ticks = getTimelineRulerTicks({
    duration: state.duration,
    frameRate: renderContext.options.ruler?.frameRate,
    includeLabels: renderContext.options.showRulerLabels,
    labelFormat: renderContext.options.ruler?.labelFormat,
    scrollLeft: state.scrollLeft,
    timecodeFormatOptions: renderContext.options.ruler?.timecodeFormatOptions,
    viewportWidth: width,
    zoomScale: state.zoomScale,
  });

  ctx.fillStyle = theme.colors.ruler.tick;
  ctx.beginPath();
  for (const tick of ticks) {
    if (tick.kind === 'major') {
      ctx.rect(tick.x, 16, 1, 16);
    } else {
      ctx.rect(tick.x, 24, 1, 8);
    }
  }
  ctx.fill();

  if (!renderContext.options.showRulerLabels) {
    return;
  }

  ctx.fillStyle = theme.colors.ruler.text;
  ctx.font = theme.fonts.ruler;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const tick of ticks) {
    if (tick.label !== undefined) {
      ctx.fillText(tick.label, tick.x, 4);
    }
  }
}

export function drawRuler(renderContext: RenderContext) {
  const { ctx, width, theme } = renderContext;
  const activeWidth = getActiveWidth(renderContext);

  ctx.fillStyle = theme.colors.ruler.bg;
  ctx.fillRect(0, 0, activeWidth, theme.metrics.rulerHeight);

  if (activeWidth < width) {
    ctx.fillStyle = 'rgba(30, 30, 30, 0.8)';
    ctx.fillRect(activeWidth, 0, width - activeWidth, theme.metrics.rulerHeight);
  }

  drawRulerTicks(renderContext);
}

export function drawMarkers(renderContext: RenderContext) {
  const { ctx, state, width, theme } = renderContext;

  state.markers?.forEach((marker: Marker) => {
    const markerX = secondsToX(renderContext, toSeconds(marker.time));
    if (markerX < -10 || markerX > width + 10) {
      return;
    }

    ctx.fillStyle = marker.color || theme.colors.marker.fill;
    ctx.beginPath();
    ctx.moveTo(markerX - 5, 16);
    ctx.lineTo(markerX + 5, 16);
    ctx.lineTo(markerX + 5, 24);
    ctx.lineTo(markerX, 32);
    ctx.lineTo(markerX - 5, 24);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'transparent';
    ctx.lineWidth = 0;

    if (marker.label) {
      ctx.fillStyle = theme.colors.marker.text;
      ctx.font = theme.fonts.ruler;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(marker.label, markerX + 6, 22);
    }
  });
}
