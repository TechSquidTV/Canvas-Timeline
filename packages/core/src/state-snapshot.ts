import { createDocumentSnapshot, shareTimelineFeedback } from '#core/document-snapshot';
import type { TimelineState, TimelineStateSnapshot } from '#core/types';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
/** Reuses unchanged document collections and scalar value objects across read snapshots. */
export function createTimelineReadSnapshot(
  state: TimelineState,
  previous: TimelineStateSnapshot | undefined,
  documentChanged: boolean
): TimelineStateSnapshot {
  const time = (value: RationalTime | undefined, prior: RationalTime | undefined) =>
    value === undefined
      ? undefined
      : prior?.v === value.v && prior.r === value.r
        ? prior
        : { ...value };
  const next: TimelineStateSnapshot = {
    ...state,
    ...(documentChanged || !previous
      ? createDocumentSnapshot(state, previous)
      : {
          tracks: previous.tracks,
          markers: previous.markers,
          clipGroups: previous.clipGroups,
        }),
    playheadTime: time(state.playheadTime, previous?.playheadTime) ?? { ...state.playheadTime },
    inPoint: time(state.inPoint, previous?.inPoint),
    outPoint: time(state.outPoint, previous?.outPoint),
    duration: time(state.duration, previous?.duration),
    snapFeedback: shareTimelineFeedback(state.snapFeedback, previous?.snapFeedback),
    clipDropFeedback: shareTimelineFeedback(state.clipDropFeedback, previous?.clipDropFeedback),
  };
  if (
    previous &&
    (Object.keys(next) as (keyof TimelineState)[]).every((key) => next[key] === previous[key])
  ) {
    return previous;
  }
  // Collection and feedback objects were frozen when created; freeze only newly owned scalar values here.
  Object.freeze(next.playheadTime);
  if (next.inPoint) {
    Object.freeze(next.inPoint);
  }
  if (next.outPoint) {
    Object.freeze(next.outPoint);
  }
  if (next.duration) {
    Object.freeze(next.duration);
  }
  return Object.freeze(next);
}
