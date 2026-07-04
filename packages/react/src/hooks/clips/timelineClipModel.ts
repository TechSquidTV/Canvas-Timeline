import type { Clip, TimelineClipEntry, Track } from '@techsquidtv/canvas-timeline-core';

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
  tracks: Track<TrackKind>[]
): TimelineSelectionState<TrackKind> {
  let selectedClip: Clip | null = null;
  let selectedClipTrackId: string | null = null;
  let selectedTrack: Track<TrackKind> | null = null;

  for (const track of tracks) {
    if (track.selected) {
      selectedTrack = track;
    }

    if (!selectedClip) {
      const clip = track.clips.find((candidate) => candidate.selected);
      if (clip) {
        selectedClip = clip;
        selectedClipTrackId = track.id;
      }
    }
  }

  return {
    selectedClip,
    selectedClipId: selectedClip?.id ?? null,
    selectedClipTrackId,
    selectedTrack,
    selectedTrackId: selectedTrack?.id ?? null,
  };
}
