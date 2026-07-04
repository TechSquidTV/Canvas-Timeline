/**
 * Shared state for double click and double tap detection.
 *
 * @internal
 */
export const globalTapState = {
  time: 0,
  x: 0,
  y: 0,
};

const TIMELINE_DOUBLE_TAP_DELAY_MS = 300;
const TIMELINE_DOUBLE_TAP_DISTANCE_PX = 20;

interface TimelineTapEvent {
  timeStamp: number;
  clientX: number;
  clientY: number;
}

/** @internal */
export function resetTimelineTapState() {
  globalTapState.time = 0;
  globalTapState.x = 0;
  globalTapState.y = 0;
}

/** @internal */
export function consumeTimelineDoubleTap(event: TimelineTapEvent) {
  const dx = event.clientX - globalTapState.x;
  const dy = event.clientY - globalTapState.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const isDoubleTap =
    event.timeStamp - globalTapState.time < TIMELINE_DOUBLE_TAP_DELAY_MS &&
    distance < TIMELINE_DOUBLE_TAP_DISTANCE_PX;

  if (isDoubleTap) {
    resetTimelineTapState();
    return true;
  }

  globalTapState.time = event.timeStamp;
  globalTapState.x = event.clientX;
  globalTapState.y = event.clientY;
  return false;
}
