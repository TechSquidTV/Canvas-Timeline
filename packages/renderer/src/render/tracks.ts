import type { Clip } from '@techsquidtv/canvas-timeline-core';
import { drawClip } from '#renderer/render/clips';
import { getActiveWidth } from '#renderer/render/geometry';
import type { RenderContext } from '#renderer/render/types';

type SelectedClip = {
  clip: Clip;
  y: number;
  trackHeight: number;
  visibleY: number;
  visibleHeight: number;
  muted: boolean;
  visible: boolean;
};

type LockedTrackOverlay = {
  y: number;
  trackHeight: number;
  visibleY: number;
  visibleHeight: number;
};

function beginTrackClip(
  ctx: OffscreenCanvasRenderingContext2D,
  visibleY: number,
  drawWidth: number,
  visibleHeight: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, visibleY, drawWidth, visibleHeight);
  ctx.clip();
}

export function drawTracks(renderContext: RenderContext) {
  const { ctx, state, height, theme } = renderContext;
  const drawWidth = getActiveWidth(renderContext);

  if (drawWidth <= 0) {
    return;
  }

  let currentY = theme.metrics.rulerHeight - state.scrollTop;
  const selectedClips: SelectedClip[] = [];
  const lockedTrackOverlays: LockedTrackOverlay[] = [];

  for (const track of state.tracks) {
    const muted = track.muted;
    const locked = track.locked;
    const visible = track.visible;
    const rawTrackHeight = track.collapsed ? 24 : track.height || theme.metrics.trackHeight;
    const y = Math.floor(currentY);
    currentY += rawTrackHeight;
    const trackHeight = Math.floor(rawTrackHeight);
    const trackBottom = y + trackHeight;
    const visibleY = Math.max(y, theme.metrics.rulerHeight);
    const visibleBottom = Math.min(trackBottom, height);
    const visibleHeight = visibleBottom - visibleY;

    if (y >= height) {
      break;
    }

    if (visibleHeight <= 0) {
      continue;
    }

    beginTrackClip(ctx, visibleY, drawWidth, visibleHeight);

    if (!visible) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
      ctx.fillRect(0, y, drawWidth, trackHeight);
    } else if (muted) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(0, y, drawWidth, trackHeight);
    }

    if (locked) {
      lockedTrackOverlays.push({ y, trackHeight, visibleY, visibleHeight });
    }

    const dividerWidth = theme.metrics.trackDividerWidth;
    const dividerY = trackBottom - dividerWidth;
    if (dividerWidth > 0 && dividerY < visibleBottom && trackBottom > visibleY) {
      ctx.fillStyle = theme.colors.track.divider;
      ctx.fillRect(0, dividerY, drawWidth, dividerWidth);
    }

    if (renderContext.options.showClips) {
      track.clips.forEach((clip: Clip) => {
        if (clip.selected) {
          selectedClips.push({
            clip,
            y,
            trackHeight,
            visibleY,
            visibleHeight,
            muted,
            visible,
          });
        } else {
          drawClip({ ...renderContext, clip, y, trackHeight, muted, visible });
        }
      });
    }

    ctx.restore();
  }

  selectedClips.forEach(({ clip, y, trackHeight, visibleY, visibleHeight, muted, visible }) => {
    beginTrackClip(ctx, visibleY, drawWidth, visibleHeight);
    drawClip({ ...renderContext, clip, y, trackHeight, muted, visible });
    ctx.restore();
  });

  for (const { y, trackHeight, visibleY, visibleHeight } of lockedTrackOverlays) {
    beginTrackClip(ctx, visibleY, drawWidth, visibleHeight);
    ctx.fillStyle = theme.colors.track.lockedOverlay;
    ctx.fillRect(0, y, drawWidth, trackHeight);
    ctx.restore();
  }
}
