import type {
  Clip,
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
  selectedClip: Clip | null;
  /** ID of the currently selected clip, or null when no clip is selected. */
  selectedClipId: string | null;
  /** ID of the track containing the selected clip, or null when no clip is selected. */
  selectedClipTrackId: string | null;
  /** All selected clips in track order. */
  selectedClips: Clip[];
  /** IDs of all selected clips in track order. */
  selectedClipIds: string[];
  /** Selected group when the primary selected clip belongs to one. */
  selectedGroup: TimelineClipGroup | null;
  /** Selected group id when the primary selected clip belongs to one. */
  selectedGroupId: string | null;
  /** Whether any clip or track is selected. */
  hasSelection: boolean;
  /** Currently selected track, or null when no track row is selected. */
  selectedTrack: Track<TrackKind> | null;
  /** ID of the currently selected track, or null when no track row is selected. */
  selectedTrackId: string | null;
}

/**
 * Flattens timeline tracks into stable clip entries.
 *
 * @param tracks - Timeline tracks to flatten.
 * @returns Flattened clip entries in track order.
 */
export function flattenTimelineClips<TrackKind>(
  tracks: Track<TrackKind>[]
): TimelineClipEntry<TrackKind>[] {
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
 * @returns Current selection metadata.
 */
export function deriveTimelineSelection<TrackKind>(
  tracks: Track<TrackKind>[],
  clipGroups: TimelineClipGroup[] = []
): TimelineSelectionState<TrackKind> {
  let selectedClip: Clip | null = null;
  let selectedClipTrackId: string | null = null;
  let selectedTrack: Track<TrackKind> | null = null;
  const selectedClips: Clip[] = [];
  const clipGroupByClipId = new Map<string, TimelineClipGroup>();
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
