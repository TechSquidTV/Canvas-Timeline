import type { Clip } from '@techsquidtv/canvas-timeline-core';
import {
  getTimelineKeyframeBezierControlPoints,
  getTimelineKeyframeValuePoint,
  normalizeTimelineCubicBezier,
  normalizeTimelineKeyframeInterpolation,
} from '@techsquidtv/canvas-timeline-core';
import { toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { timeToX } from './geometry';
import type { RenderContext } from './types';

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
    drawClipKeyframes(renderContext, {
      clipX: startX,
      clipWidth,
      clipY,
      clipHeight,
    });
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

function drawClipKeyframes(
  renderContext: ClipRenderContext,
  metrics: {
    clipX: number;
    clipWidth: number;
    clipY: number;
    clipHeight: number;
  }
) {
  const { ctx, clip, theme } = renderContext;
  const keyframes = (clip.keyframes ?? [])
    .filter(
      (keyframe) =>
        keyframe.property === 'opacity' &&
        toSeconds(keyframe.time) >= toSeconds(clip.timelineStart) &&
        toSeconds(keyframe.time) <= toSeconds(clip.timelineEnd)
    )
    .sort((a, b) => toSeconds(a.time) - toSeconds(b.time));

  if (keyframes.length === 0) {
    return;
  }

  const handleSize = 6;
  const valuePadding = Math.max(5, Math.min(10, metrics.clipHeight / 4));
  const getKeyframePoint = (keyframe: (typeof keyframes)[number]) =>
    getTimelineKeyframeValuePoint({
      timeX: timeToX(renderContext, keyframe.time),
      value: keyframe.value,
      clipX: metrics.clipX,
      clipWidth: metrics.clipWidth,
      clipY: metrics.clipY,
      clipHeight: metrics.clipHeight,
      valuePadding,
      handleSize,
    });

  if (keyframes.length > 1) {
    ctx.save();
    ctx.beginPath();
    const firstPoint = getKeyframePoint(keyframes[0]);
    ctx.moveTo(firstPoint.x, firstPoint.y);

    for (let index = 1; index < keyframes.length; index++) {
      const previousKeyframe = keyframes[index - 1];
      const previousPoint = getKeyframePoint(previousKeyframe);
      const point = getKeyframePoint(keyframes[index]);

      const interpolation = normalizeTimelineKeyframeInterpolation(previousKeyframe.interpolation);
      if (interpolation === 'hold') {
        ctx.lineTo(point.x, previousPoint.y);
        ctx.lineTo(point.x, point.y);
      } else if (interpolation === 'bezier') {
        const easing = normalizeTimelineCubicBezier(previousKeyframe.easing);
        const { controlPoint1, controlPoint2 } = getTimelineKeyframeBezierControlPoints(
          previousPoint,
          point,
          easing
        );
        ctx.bezierCurveTo(
          controlPoint1.x,
          controlPoint1.y,
          controlPoint2.x,
          controlPoint2.y,
          point.x,
          point.y
        );
      } else {
        ctx.lineTo(point.x, point.y);
      }
    }
    ctx.strokeStyle = theme.colors.keyframe.line;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  for (const keyframe of keyframes) {
    const point = getKeyframePoint(keyframe);
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
