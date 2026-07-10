import type { Clip, Marker, TimelineClipGroup, Track } from '@techsquidtv/canvas-timeline-core';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import type { EditorTrackKind } from '#full-editor/data/demo-project';
import { isProjectFrameRate } from '#full-editor/project/frame-rate';
import type {
  PersistedTimelineState,
  ProjectStorageSnapshot,
} from '#full-editor/persistence/project/types';

interface JsonObject {
  readonly [key: string]: unknown;
}

export function parseProjectSnapshot(text: string): ProjectStorageSnapshot {
  const parsed: unknown = JSON.parse(text);

  if (!isProjectSnapshot(parsed)) {
    throw new Error('Unsupported or invalid project snapshot.');
  }

  return parsed;
}

function isProjectSnapshot(value: unknown): value is ProjectStorageSnapshot {
  if (!isJsonObject(value)) {
    return false;
  }

  return (
    value.version === 3 &&
    typeof value.projectId === 'string' &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    typeof value.frameRate === 'number' &&
    isProjectFrameRate(value.frameRate) &&
    isPositiveFiniteNumber(value.height) &&
    isPositiveFiniteNumber(value.width) &&
    typeof value.savedAt === 'string' &&
    isPersistedTimelineState(value.timelineState)
  );
}

function isPersistedTimelineState(value: unknown): value is PersistedTimelineState {
  if (!isJsonObject(value)) {
    return false;
  }

  return (
    Array.isArray(value.clipGroups) &&
    value.clipGroups.every(isClipGroup) &&
    (value.duration === undefined || isRationalTime(value.duration)) &&
    (value.inPoint === undefined || isRationalTime(value.inPoint)) &&
    Array.isArray(value.markers) &&
    value.markers.every(isMarker) &&
    (value.outPoint === undefined || isRationalTime(value.outPoint)) &&
    isRationalTime(value.playheadTime) &&
    typeof value.scrollLeft === 'number' &&
    typeof value.scrollTop === 'number' &&
    typeof value.snapEnabled === 'boolean' &&
    typeof value.snapThresholdPixels === 'number' &&
    Array.isArray(value.tracks) &&
    value.tracks.every(isTrack) &&
    typeof value.zoomScale === 'number'
  );
}

function isClipGroup(value: unknown): value is TimelineClipGroup {
  if (!isJsonObject(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    Array.isArray(value.clipIds) &&
    value.clipIds.every((clipId) => typeof clipId === 'string') &&
    (value.label === undefined || typeof value.label === 'string')
  );
}

function isTrack(value: unknown): value is Track<EditorTrackKind> {
  if (!isJsonObject(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    (value.kind === 'audio' || value.kind === 'visual') &&
    Array.isArray(value.clips) &&
    value.clips.every(isClip) &&
    typeof value.selected === 'boolean' &&
    typeof value.locked === 'boolean' &&
    typeof value.muted === 'boolean' &&
    typeof value.visible === 'boolean'
  );
}

function isClip(value: unknown): value is Clip {
  if (!isJsonObject(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.sourceId === 'string' &&
    isRationalTime(value.timelineStart) &&
    isRationalTime(value.timelineEnd) &&
    isRationalTime(value.sourceStart) &&
    typeof value.selected === 'boolean'
  );
}

function isMarker(value: unknown): value is Marker {
  if (!isJsonObject(value)) {
    return false;
  }

  return typeof value.id === 'string' && isRationalTime(value.time);
}

function isRationalTime(value: unknown): value is RationalTime {
  return (
    isJsonObject(value) &&
    typeof value.v === 'number' &&
    typeof value.r === 'number' &&
    Number.isFinite(value.v) &&
    Number.isFinite(value.r) &&
    value.r > 0
  );
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
