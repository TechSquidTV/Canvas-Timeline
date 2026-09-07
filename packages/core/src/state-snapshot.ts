import type { TimelineState, TimelineStateSnapshot, TimelineReadonly } from '#core/types';
import {
  createTrackSnapshots,
  createMarkerSnapshots,
  createClipGroupSnapshots,
} from '#core/snapshot';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
/** Freezes a snapshot recursively without traversing the same metadata object twice. */
function freezeTimelineSnapshot<Value>(value: Value, seen = new WeakSet<object>()): Value {
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const key of Object.keys(value) as (keyof Value)[]) {
    freezeTimelineSnapshot(value[key], seen);
  }
  return Object.freeze(value);
}

/** Reuses unchanged document collections and scalar value objects across read snapshots. */
export function createTimelineReadSnapshot(
  state: TimelineState,
  previous: TimelineStateSnapshot | undefined,
  documentChanged: boolean
): TimelineStateSnapshot {
  const share = <Value>(
    value: Value,
    prior: TimelineReadonly<Value> | undefined
  ): TimelineReadonly<Value> => {
    if (prior !== undefined && JSON.stringify(value) === JSON.stringify(prior)) {
      return prior;
    }
    return freezeTimelineSnapshot(value) as TimelineReadonly<Value>;
  };
  const time = (value: RationalTime | undefined, prior: RationalTime | undefined) =>
    value === undefined
      ? undefined
      : prior?.v === value.v && prior.r === value.r
        ? prior
        : { ...value };
  const next: TimelineStateSnapshot = {
    ...state,
    tracks:
      documentChanged || !previous
        ? share(createTrackSnapshots(state.tracks), previous?.tracks)
        : previous.tracks,
    markers:
      documentChanged || !previous
        ? share(createMarkerSnapshots(state.markers), previous?.markers)
        : previous.markers,
    clipGroups:
      documentChanged || !previous
        ? share(createClipGroupSnapshots(state.clipGroups), previous?.clipGroups)
        : previous.clipGroups,
    playheadTime: time(state.playheadTime, previous?.playheadTime) ?? { ...state.playheadTime },
    inPoint: time(state.inPoint, previous?.inPoint),
    outPoint: time(state.outPoint, previous?.outPoint),
    duration: time(state.duration, previous?.duration),
    snapFeedback: share(structuredClone(state.snapFeedback), previous?.snapFeedback),
    clipDropFeedback: share({ ...state.clipDropFeedback }, previous?.clipDropFeedback),
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
