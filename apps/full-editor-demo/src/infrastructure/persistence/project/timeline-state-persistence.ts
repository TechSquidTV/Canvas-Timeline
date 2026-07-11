import type { Clip, Marker, TimelineClipGroup, Track } from '@techsquidtv/canvas-timeline-core';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import type { EditorTrackKind } from '#full-editor/features/project/demo-project';
import type { PersistedTimelineState } from '#full-editor/infrastructure/persistence/project/types';

export function sanitizePersistedTimelineState(
  state: PersistedTimelineState
): PersistedTimelineState {
  return {
    clipGroups: state.clipGroups.map(cloneClipGroup),
    duration: cloneOptionalRationalTime(state.duration),
    inPoint: cloneOptionalRationalTime(state.inPoint),
    markers: state.markers.map(cloneMarker),
    outPoint: cloneOptionalRationalTime(state.outPoint),
    playheadTime: cloneRationalTime(state.playheadTime),
    scrollLeft: state.scrollLeft,
    scrollTop: state.scrollTop,
    snapEnabled: state.snapEnabled,
    snapThresholdPixels: state.snapThresholdPixels,
    tracks: state.tracks.map(cloneTrack),
    zoomScale: state.zoomScale,
  };
}

function cloneTrack(track: Track): Track<EditorTrackKind> {
  return {
    ...track,
    kind: track.kind as EditorTrackKind,
    clips: track.clips.map(cloneClip),
  };
}

function cloneClip(clip: Clip): Clip {
  const { editPreview: _editPreview, ...rest } = clip;

  return {
    ...rest,
    sourceStart: cloneRationalTime(clip.sourceStart),
    timelineEnd: cloneRationalTime(clip.timelineEnd),
    timelineStart: cloneRationalTime(clip.timelineStart),
    keyframes: clip.keyframes?.map((keyframe) => ({
      ...keyframe,
      time: cloneRationalTime(keyframe.time),
    })),
    metadata: clip.metadata === undefined ? undefined : { ...clip.metadata },
  };
}

function cloneClipGroup(group: TimelineClipGroup): TimelineClipGroup {
  return {
    ...group,
    clipIds: [...group.clipIds],
  };
}

function cloneMarker(marker: Marker): Marker {
  return {
    ...marker,
    time: cloneRationalTime(marker.time),
  };
}

function cloneOptionalRationalTime(time: RationalTime | undefined) {
  return time === undefined ? undefined : cloneRationalTime(time);
}

function cloneRationalTime(time: RationalTime): RationalTime {
  return { v: time.v, r: time.r };
}
