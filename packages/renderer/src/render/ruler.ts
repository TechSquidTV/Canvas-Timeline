import { getTimelineRulerTicks, type Marker } from '@techsquidtv/canvas-timeline-core';
import {
  formatTime,
  formatTimecode,
  fromSeconds,
  resolveTimecodeFrameRate,
  toSeconds,
} from '@techsquidtv/canvas-timeline-utils';
import { getActiveWidth, secondsToX } from '#renderer/render/geometry';
import type { RenderContext } from '#renderer/render/types';

const rulerLabelGap = 8;

function getVisibleRulerEndSeconds(renderContext: RenderContext) {
  const { state, width } = renderContext;
  const zoomScale = Math.max(state.zoomScale || 0, 0.1);
  const visibleEndSeconds = (Math.max(0, state.scrollLeft) + width) / zoomScale;

  return state.duration
    ? Math.min(visibleEndSeconds, Math.max(0, toSeconds(state.duration)))
    : visibleEndSeconds;
}

function getRulerLabelMeasurementSample(renderContext: RenderContext) {
  const ruler = renderContext.options.ruler;
  const visibleEndSeconds = getVisibleRulerEndSeconds(renderContext);
  let label: string;

  if (ruler === undefined || ruler.format === 'seconds') {
    label = formatTime(fromSeconds(visibleEndSeconds));
  } else if (ruler.format === 'frame-number') {
    label = String(Math.ceil(visibleEndSeconds * resolveTimecodeFrameRate(ruler.frameRate)));
  } else {
    label = formatTimecode(visibleEndSeconds, {
      frameRate: ruler.frameRate,
      ...ruler.timecodeFormatOptions,
    });
  }

  return label.replaceAll(/\d/g, '8');
}

function getRulerLabelLayout(renderContext: RenderContext) {
  const { ctx, options, theme } = renderContext;
  const configuredSpacing = options.ruler?.minimumMajorTickSpacing;

  if (!options.showRulerLabels) {
    return { labelWidth: 0, minimumMajorTickSpacing: configuredSpacing };
  }

  ctx.font = theme.fonts.ruler;
  const labelWidth = Math.ceil(
    ctx.measureText(getRulerLabelMeasurementSample(renderContext)).width
  );
  const measuredSpacing = labelWidth + rulerLabelGap;

  return {
    labelWidth,
    minimumMajorTickSpacing:
      configuredSpacing === undefined || !Number.isFinite(configuredSpacing)
        ? measuredSpacing
        : Math.max(configuredSpacing, measuredSpacing),
  };
}

function drawRulerTicks(renderContext: RenderContext) {
  const { ctx, state, width, theme } = renderContext;
  const ruler = renderContext.options.ruler ?? { format: 'seconds' as const };
  const labelLayout = getRulerLabelLayout(renderContext);
  const ticks = getTimelineRulerTicks({
    ...ruler,
    duration: state.duration,
    includeLabels: renderContext.options.showRulerLabels,
    minimumMajorTickSpacing: labelLayout.minimumMajorTickSpacing,
    scrollLeft: state.scrollLeft,
    viewportWidth: width,
    zoomScale: state.zoomScale,
  });

  ctx.fillStyle = theme.colors.ruler.tick;
  ctx.beginPath();
  for (const tick of ticks) {
    if (tick.kind === 'major') {
      ctx.rect(tick.x, 16, 1, 16);
    } else if (tick.kind === 'medium') {
      ctx.rect(tick.x, 20, 1, 12);
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
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const labelViewportWidth = Math.min(width, getActiveWidth(renderContext));
  if (labelLayout.labelWidth > labelViewportWidth) {
    return;
  }

  let previousLabelRight = Number.NEGATIVE_INFINITY;
  const maximumLabelLeft = labelViewportWidth - labelLayout.labelWidth;

  for (const tick of ticks) {
    if (tick.label !== undefined) {
      const labelLeft = Math.min(
        Math.max(0, tick.x - labelLayout.labelWidth / 2),
        maximumLabelLeft
      );
      if (labelLeft < previousLabelRight + rulerLabelGap) {
        continue;
      }

      ctx.fillText(tick.label, labelLeft, 4);
      previousLabelRight = labelLeft + labelLayout.labelWidth;
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
