import type {
  Clip,
  TimelineReadonly,
  TimelineClipEntry,
  TimelineClipGroup,
  Track,
} from '@techsquidtv/canvas-timeline-core';

export type { TimelineClipEntry } from '@techsquidtv/canvas-timeline-core';

/**
 * Selected clip and track state derived from the current timeline snapshot.
 *
 * @template TrackKind - App-defined track kind.
 */
export interface TimelineSelectionState<TrackKind = string> {
  /** Currently selected clip, or null when no clip is selected. */
  selectedClip: TimelineReadonly<Clip> | null;
  /** ID of the currently selected clip, or null when no clip is selected. */
  selectedClipId: string | null;
  /** ID of the track containing the selected clip, or null when no clip is selected. */
  selectedClipTrackId: string | null;
  /** All selected clips in track order. */
  selectedClips: TimelineReadonly<Clip>[];
  /** IDs of all selected clips in track order. */
  selectedClipIds: string[];
  /** Selected group when the primary selected clip belongs to one. */
  selectedGroup: TimelineReadonly<TimelineClipGroup> | null;
  /** Selected group id when the primary selected clip belongs to one. */
  selectedGroupId: string | null;
  /** Whether any clip or track is selected. */
  hasSelection: boolean;
  /** Currently selected track, or null when no track row is selected. */
  selectedTrack: TimelineReadonly<Track<TrackKind>> | null;
  /** ID of the currently selected track, or null when no track row is selected. */
  selectedTrackId: string | null;
}

/**
 * Flattens timeline tracks into stable clip entries.
 *
 * @param tracks - Timeline tracks to flatten.
 * @template TrackKind - App-defined track kind values carried by returned
 * entries.
 * @returns Flattened clip entries in track order.
 */
export function flattenTimelineClips<TrackKind>(
  tracks: readonly TimelineReadonly<Track<TrackKind>>[]
): TimelineReadonly<TimelineClipEntry<TrackKind>>[] {
  return tracks.flatMap((track, trackIndex) =>
    track.clips.map((clip, clipIndex) => ({
      clip,
      track,
      trackIndex,
      clipIndex,
    }))
  );
}

/**
 * Derives selected clip and track metadata from timeline tracks.
 *
 * @param tracks - Timeline tracks to inspect.
 * @param clipGroups - Clip group state used to derive selected group metadata.
 * @template TrackKind - App-defined track kind values carried by selected track
 * state.
 * @returns Current selection metadata.
 */
export function deriveTimelineSelection<TrackKind>(
  tracks: readonly TimelineReadonly<Track<TrackKind>>[],
  clipGroups: readonly TimelineReadonly<TimelineClipGroup>[] = []
): TimelineSelectionState<TrackKind> {
  let selectedClip: TimelineReadonly<Clip> | null = null;
  let selectedClipTrackId: string | null = null;
  let selectedTrack: TimelineReadonly<Track<TrackKind>> | null = null;
  const selectedClips: TimelineReadonly<Clip>[] = [];
  const clipGroupByClipId = new Map<string, TimelineReadonly<TimelineClipGroup>>();
  for (const group of clipGroups) {
    for (const clipId of group.clipIds) {
      clipGroupByClipId.set(clipId, group);
    }
  }

  for (const track of tracks) {
    if (track.selected) {
      selectedTrack = track;
    }

    for (const clip of track.clips) {
      if (clip.selected) {
        selectedClips.push(clip);
      }
      if (!selectedClip && clip.selected) {
        selectedClip = clip;
        selectedClipTrackId = track.id;
      }
    }
  }
  const selectedGroup =
    selectedClip === null ? null : (clipGroupByClipId.get(selectedClip.id) ?? null);

  return {
    selectedClip,
    selectedClipId: selectedClip?.id ?? null,
    selectedClipTrackId,
    selectedClips,
    selectedClipIds: selectedClips.map((clip) => clip.id),
    selectedGroup,
    selectedGroupId: selectedGroup?.id ?? null,
    selectedTrack,
    selectedTrackId: selectedTrack?.id ?? null,
    hasSelection: selectedClips.length > 0 || selectedTrack !== null,
  };
}
