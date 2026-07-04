import { toSeconds } from '@techsquidtv/canvas-timeline-utils';
import type { RenderContext } from './types';

export function timeToX({ state }: RenderContext, time: Parameters<typeof toSeconds>[0]) {
  return Math.floor(toSeconds(time) * state.zoomScale - state.scrollLeft);
}

export function secondsToX({ state }: RenderContext, seconds: number) {
  return Math.floor(seconds * state.zoomScale - state.scrollLeft);
}

export function getContentWidth({ state, width }: RenderContext) {
  return state.duration
    ? Math.max(0, toSeconds(state.duration) * state.zoomScale - state.scrollLeft)
    : width;
}

export function getActiveWidth(renderContext: RenderContext) {
  return Math.min(renderContext.width, getContentWidth(renderContext));
}
