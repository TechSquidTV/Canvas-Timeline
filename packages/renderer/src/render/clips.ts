import type { Clip, TimelineKeyframeRenderClip } from '@techsquidtv/canvas-timeline-core';
import { timeToX } from '#renderer/render/geometry';
import type { RenderContext } from '#renderer/render/types';

export type ClipRenderContext = RenderContext & {
  clip: Clip;
  y: number;
  trackHeight: number;
  muted: boolean;
  visible: boolean;
};

export function drawClip(renderContext: ClipRenderContext) {
  const { ctx, clip, y, trackHeight, muted, visible, width, theme } = renderContext;
  const startX = timeToX(renderContext, clip.timelineStart);
  const endX = timeToX(renderContext, clip.timelineEnd);
  const clipWidth = endX - startX;
  const clipInsetY = Math.min(theme.metrics.clipInsetY, Math.max(0, (trackHeight - 1) / 2));
  const clipY = y + clipInsetY;
  const clipHeight = Math.max(1, trackHeight - clipInsetY * 2);
  const clipRadius = Math.min(theme.metrics.clipRadius, clipHeight / 2, Math.max(clipWidth, 1) / 2);

  if (endX < 0 || startX > width) {
    return;
  }

  const globalOpacity = !visible || muted || clip.disabled ? 0.35 : (clip.opacity ?? 1);

  ctx.globalAlpha = globalOpacity;

  const baseColor =
    clip.color || (clip.selected ? theme.colors.clip.bgSelected : theme.colors.clip.bg);
  ctx.fillStyle = baseColor;

  ctx.beginPath();
  ctx.roundRect(startX, clipY, Math.max(clipWidth, 1), clipHeight, clipRadius);
  ctx.fill();

  ctx.strokeStyle = clip.selected ? theme.colors.clip.borderSelected : theme.colors.clip.border;
  ctx.lineWidth = clip.selected ? 2 : 1;
  ctx.stroke();

  ctx.globalAlpha = 1;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(startX, clipY, Math.max(clipWidth, 1), clipHeight, clipRadius);
  ctx.clip();

  if (renderContext.options.showKeyframes) {
    drawClipKeyframes(renderContext);
  }

  if (renderContext.options.showClipLabels && clipWidth > 20) {
    ctx.fillStyle = clip.selected ? theme.colors.clip.textSelected : theme.colors.clip.text;
    ctx.font = theme.fonts.clip;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const clipName = String(clip.label ?? 'Clip');
    ctx.fillText(
      clipName,
      startX + theme.metrics.clipLabelPaddingX,
      clipY + Math.floor(clipHeight / 2)
    );
  }

  ctx.restore();
}

function drawClipKeyframes(renderContext: ClipRenderContext) {
  const { ctx, clip, theme } = renderContext;
  const clipGeometry = renderContext.keyframeGeometryByClip?.get(clip.id);
  if (
    clipGeometry === undefined ||
    (clipGeometry.points.length === 0 && clipGeometry.segments.length === 0)
  ) {
    return;
  }

  const handleSize = 6;
  drawPreparedKeyframeSegments(renderContext, clipGeometry);

  for (const keyframe of clipGeometry.points) {
    const point = keyframe.point;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = keyframe.selected
      ? theme.colors.keyframe.fillSelected
      : theme.colors.keyframe.fill;
    ctx.strokeStyle = keyframe.selected
      ? theme.colors.keyframe.strokeSelected
      : theme.colors.keyframe.stroke;
    ctx.lineWidth = 1.5;
    ctx.fillRect(-handleSize / 2, -handleSize / 2, handleSize, handleSize);
    ctx.strokeRect(-handleSize / 2, -handleSize / 2, handleSize, handleSize);
    ctx.restore();
  }
}

function drawPreparedKeyframeSegments(
  renderContext: ClipRenderContext,
  clipGeometry: TimelineKeyframeRenderClip
) {
  const { ctx, theme } = renderContext;
  if (clipGeometry.segments.length === 0) {
    return;
  }

  ctx.save();
  ctx.beginPath();
  for (const segment of clipGeometry.segments) {
    ctx.moveTo(segment.startPoint.x, segment.startPoint.y);
    if (segment.interpolation === 'hold') {
      ctx.lineTo(segment.endPoint.x, segment.startPoint.y);
      ctx.lineTo(segment.endPoint.x, segment.endPoint.y);
    } else if (
      segment.interpolation === 'bezier' &&
      segment.controlPoint1 !== undefined &&
      segment.controlPoint2 !== undefined
    ) {
      ctx.bezierCurveTo(
        segment.controlPoint1.x,
        segment.controlPoint1.y,
        segment.controlPoint2.x,
        segment.controlPoint2.y,
        segment.endPoint.x,
        segment.endPoint.y
      );
    } else {
      ctx.lineTo(segment.endPoint.x, segment.endPoint.y);
    }
  }
  ctx.strokeStyle = theme.colors.keyframe.line;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}
