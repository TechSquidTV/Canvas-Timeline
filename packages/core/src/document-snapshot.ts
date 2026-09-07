import {
  createClipSnapshot,
  createMarkerSnapshots,
  createClipGroupSnapshots,
} from '#core/snapshot';
import type { TimelineReadonly, TimelineState, TimelineStateSnapshot, Track } from '#core/types';

/** Compares model values without serializing or cloning unchanged document nodes. */
function equalValue(left: unknown, right: unknown, seen = new WeakMap<object, object>()): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) {
    return false;
  }
  if (seen.get(left) === right) {
    return true;
  }
  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) {
    return false;
  }
  if (Array.isArray(left) && Array.isArray(right) && left.length !== right.length) {
    return false;
  }
  seen.set(left, right);
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  if (left instanceof Map && right instanceof Map) {
    return left.size === right.size && equalValue([...left], [...right], seen);
  }
  if (left instanceof Set && right instanceof Set) {
    return left.size === right.size && equalValue([...left], [...right], seen);
  }
  // Other structured-cloneable metadata (buffers, blobs, etc.) is copied conservatively.
  if (
    !Array.isArray(left) &&
    Object.getPrototypeOf(left) !== Object.prototype &&
    Object.getPrototypeOf(left) !== null
  ) {
    return false;
  }
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && equalValue(a[key], b[key], seen))
  );
}

/** Freezes newly owned model values; already shared snapshots need no traversal. */
function freezeTimelineSnapshot<Value>(
  value: Value,
  seen = new WeakSet<object>()
): TimelineReadonly<Value> {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value) || seen.has(value)) {
    return value as TimelineReadonly<Value>;
  }
  seen.add(value);
  for (const key of Object.keys(value) as (keyof Value)[]) {
    freezeTimelineSnapshot(value[key], seen);
  }
  return Object.freeze(value) as TimelineReadonly<Value>;
}

function shareCollection<Value extends { id: string }>(
  values: readonly Value[],
  previous: readonly TimelineReadonly<Value>[] | undefined,
  snapshot: (value: Value, prior: TimelineReadonly<Value> | undefined) => TimelineReadonly<Value>
): readonly TimelineReadonly<Value>[] {
  const byId = new Map(previous?.map((value) => [value.id, value]));
  const next = values.map((value) => snapshot(value, byId.get(value.id)));
  return previous &&
    next.length === previous.length &&
    next.every((value, index) => value === previous[index])
    ? previous
    : Object.freeze(next);
}

function shareTrack(
  track: Track,
  previous: TimelineReadonly<Track> | undefined
): TimelineReadonly<Track> {
  const clips = shareCollection(track.clips, previous?.clips, (clip, prior) =>
    prior && equalValue(clip, prior) ? prior : freezeTimelineSnapshot(createClipSnapshot(clip))
  );
  const { clips: _clips, ...fields } = track;
  const { clips: _priorClips, ...priorFields } = previous ?? { clips: [] };
  if (previous && clips === previous.clips && equalValue(fields, priorFields)) {
    return previous;
  }
  return freezeTimelineSnapshot({ ...structuredClone(fields), clips });
}

/** Shares document collections across reads and history while preserving unchanged entity identities. */
export function createDocumentSnapshot(state: TimelineState, previous?: TimelineStateSnapshot) {
  return {
    tracks: shareCollection(state.tracks, previous?.tracks, shareTrack),
    markers: shareCollection(state.markers ?? [], previous?.markers, (marker, prior) =>
      prior && equalValue(marker, prior)
        ? prior
        : freezeTimelineSnapshot(createMarkerSnapshots([marker])[0])
    ),
    clipGroups: shareCollection(state.clipGroups, previous?.clipGroups, (group, prior) =>
      prior && equalValue(group, prior)
        ? prior
        : freezeTimelineSnapshot(createClipGroupSnapshots([group])[0])
    ),
  };
}

/** Reuses small feedback values independently of document revisions. */
export function shareTimelineFeedback<Value>(
  value: Value,
  previous: TimelineReadonly<Value> | undefined
): TimelineReadonly<Value> {
  return previous !== undefined && equalValue(value, previous)
    ? previous
    : freezeTimelineSnapshot(structuredClone(value));
}
