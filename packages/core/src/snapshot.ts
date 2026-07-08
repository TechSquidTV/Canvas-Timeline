import type { Clip, Marker, TimelineClipGroup, TimelineKeyframe, Track } from './types';
import {
  defaultTimelineIncomingBezierHandle,
  defaultTimelineOutgoingBezierHandle,
  normalizeTimelineKeyframeSideInterpolation,
} from './keyframes';
import {
  assertValidRationalTime,
  compareRational,
  type RationalTime,
} from '@techsquidtv/canvas-timeline-utils';

export function assertValidTimelineNumber(value: number, label: string) {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number.`);
  }
}

export function assertNonNegativeTimelineNumber(value: number, label: string) {
  assertValidTimelineNumber(value, label);
  if (value < 0) {
    throw new RangeError(`${label} must be greater than or equal to 0.`);
  }
}

export function assertPositiveTimelineNumber(value: number, label: string) {
  assertValidTimelineNumber(value, label);
  if (value <= 0) {
    throw new RangeError(`${label} must be greater than 0.`);
  }
}

export function assertValidClipTiming(clip: Clip, label: string) {
  assertValidRationalTime(clip.timelineStart, `${label}.timelineStart`);
  assertValidRationalTime(clip.timelineEnd, `${label}.timelineEnd`);
  assertValidRationalTime(clip.sourceStart, `${label}.sourceStart`);
  if (compareRational(clip.timelineEnd, clip.timelineStart) <= 0) {
    throw new RangeError(`${label}.timelineEnd must be after ${label}.timelineStart.`);
  }
  if (clip.minStart !== undefined) {
    assertValidRationalTime(clip.minStart, `${label}.minStart`);
  }
  if (clip.maxEnd !== undefined) {
    assertValidRationalTime(clip.maxEnd, `${label}.maxEnd`);
  }
  if (
    clip.minStart !== undefined &&
    clip.maxEnd !== undefined &&
    compareRational(clip.maxEnd, clip.minStart) <= 0
  ) {
    throw new RangeError(`${label}.maxEnd must be after ${label}.minStart.`);
  }
}

export function cloneRationalTime(time: RationalTime): RationalTime {
  assertValidRationalTime(time);
  return { v: time.v, r: time.r };
}

function assertValidMarkerTiming(marker: Marker, label: string) {
  assertValidRationalTime(marker.time, `${label}.time`);
}

function assertValidKeyframe(keyframe: TimelineKeyframe, label: string) {
  assertValidRationalTime(keyframe.time, `${label}.time`);
  assertValidTimelineNumber(keyframe.value, `${label}.value`);
}

export function cloneTimelineKeyframe(keyframe: TimelineKeyframe): TimelineKeyframe {
  assertValidKeyframe(keyframe, `keyframe "${keyframe.id}"`);
  const next: TimelineKeyframe = {
    id: keyframe.id,
    property: keyframe.property,
    time: cloneRationalTime(keyframe.time),
    value: keyframe.value,
  };

  if (keyframe.incoming !== undefined) {
    next.incoming = normalizeTimelineKeyframeSideInterpolation(
      keyframe.incoming,
      defaultTimelineIncomingBezierHandle
    );
  }
  if (keyframe.outgoing !== undefined) {
    next.outgoing = normalizeTimelineKeyframeSideInterpolation(
      keyframe.outgoing,
      defaultTimelineOutgoingBezierHandle
    );
  }
  if (keyframe.selected !== undefined) {
    next.selected = keyframe.selected;
  }

  return next;
}

export function sortTimelineKeyframes(keyframes: TimelineKeyframe[]) {
  keyframes.sort((a, b) => {
    const propertyCompare = a.property.localeCompare(b.property);
    return propertyCompare === 0 ? compareRational(a.time, b.time) : propertyCompare;
  });
}

export function cloneTimelineKeyframes(
  keyframes: TimelineKeyframe[] | undefined
): TimelineKeyframe[] {
  const next = (keyframes ?? []).map((keyframe) => cloneTimelineKeyframe(keyframe));
  sortTimelineKeyframes(next);
  return next;
}

export function hasTimelineKeyframes(clip: Clip) {
  return (clip.keyframes?.length ?? 0) > 0;
}

export function createClipSnapshot(clip: Clip, overrides: Partial<Clip> = {}): Clip {
  const next: Clip = {
    id: overrides.id ?? clip.id,
    sourceId: overrides.sourceId ?? clip.sourceId,
    timelineStart: overrides.timelineStart ?? clip.timelineStart,
    timelineEnd: overrides.timelineEnd ?? clip.timelineEnd,
    sourceStart: overrides.sourceStart ?? clip.sourceStart,
    selected: overrides.selected ?? clip.selected,
  };

  const color = overrides.color ?? clip.color;
  if (color !== undefined) {
    next.color = color;
  }

  const opacity = overrides.opacity ?? clip.opacity;
  if (opacity !== undefined) {
    next.opacity = opacity;
  }

  const label = overrides.label ?? clip.label;
  if (label !== undefined) {
    next.label = label;
  }

  const movable = overrides.movable ?? clip.movable;
  if (movable !== undefined) {
    next.movable = movable;
  }

  const resizable = overrides.resizable ?? clip.resizable;
  if (resizable !== undefined) {
    next.resizable = resizable;
  }

  const disabled = overrides.disabled ?? clip.disabled;
  if (disabled !== undefined) {
    next.disabled = disabled;
  }

  const minStart = overrides.minStart ?? clip.minStart;
  if (minStart !== undefined) {
    next.minStart = minStart;
  }

  const maxEnd = overrides.maxEnd ?? clip.maxEnd;
  if (maxEnd !== undefined) {
    next.maxEnd = maxEnd;
  }

  const editPreview = overrides.editPreview ?? clip.editPreview;
  if (editPreview !== undefined) {
    next.editPreview = editPreview;
  }

  const snap = overrides.snap ?? clip.snap;
  if (snap !== undefined) {
    next.snap = typeof snap === 'object' && snap !== null ? { ...snap } : snap;
  }

  const keyframes = overrides.keyframes ?? clip.keyframes;
  if (keyframes !== undefined) {
    next.keyframes = cloneTimelineKeyframes(keyframes);
  }

  const metadata = overrides.metadata ?? clip.metadata;
  if (metadata !== undefined) {
    next.metadata = typeof metadata === 'object' && metadata !== null ? { ...metadata } : metadata;
  }

  assertValidClipTiming(next, `clip "${next.id}"`);
  return next;
}

export function createTrackSnapshot(track: Track): Track {
  if (track.height !== undefined) {
    assertPositiveTimelineNumber(track.height, `track "${track.id}".height`);
  }
  const next: Track = {
    id: track.id,
    kind: track.kind,
    clips: track.clips.map((clip) => createClipSnapshot(clip)),
    selected: track.selected,
    locked: track.locked,
    muted: track.muted,
    visible: track.visible,
  };

  if (track.height !== undefined) {
    next.height = track.height;
  }
  if (track.collapsed !== undefined) {
    next.collapsed = track.collapsed;
  }
  if (track.name !== undefined) {
    next.name = track.name;
  }
  if (track.targeted !== undefined) {
    next.targeted = track.targeted;
  }
  if (track.groupId !== undefined) {
    next.groupId = track.groupId;
  }
  if (track.snap !== undefined) {
    next.snap =
      typeof track.snap === 'object' && track.snap !== null ? { ...track.snap } : track.snap;
  }

  return next;
}

export function createTrackSnapshots(tracks: Track[]): Track[] {
  return tracks.map((track) => createTrackSnapshot(track));
}

export function stringifyTrackSnapshots(tracks: Track[]): string {
  return JSON.stringify(createTrackSnapshots(tracks));
}

export function createMarkerSnapshots(markers: Marker[] | undefined): Marker[] {
  return (markers ?? []).map((marker) => {
    assertValidMarkerTiming(marker, `marker "${marker.id}"`);
    return { ...marker };
  });
}

export function createClipGroupSnapshots(
  clipGroups: TimelineClipGroup[] | undefined
): TimelineClipGroup[] {
  const groupIds = new Set<string>();
  const groupedClipIds = new Set<string>();
  return (clipGroups ?? []).map((group) => {
    if (groupIds.has(group.id)) {
      throw new RangeError(`duplicate clip group id "${group.id}".`);
    }
    groupIds.add(group.id);
    if (group.clipIds.length < 2) {
      throw new RangeError(`clip group "${group.id}" must contain at least two clips.`);
    }
    const uniqueClipIds = new Set(group.clipIds);
    if (uniqueClipIds.size !== group.clipIds.length) {
      throw new RangeError(`clip group "${group.id}" contains duplicate clip ids.`);
    }
    for (const clipId of group.clipIds) {
      if (groupedClipIds.has(clipId)) {
        throw new RangeError(`clip "${clipId}" belongs to more than one clip group.`);
      }
      groupedClipIds.add(clipId);
    }
    return {
      id: group.id,
      clipIds: [...group.clipIds],
      ...(group.label !== undefined ? { label: group.label } : {}),
    };
  });
}
