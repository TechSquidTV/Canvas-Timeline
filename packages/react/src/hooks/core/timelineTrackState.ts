import type { TimelineState, Track } from '@techsquidtv/canvas-timeline-core';

/**
 * Returns timeline tracks with the app's track-kind type applied at the hook boundary.
 *
 * Timeline state stores tracks with the package default track-kind type. React
 * hooks reintroduce the consumer's narrower `TrackKind` generic when returning
 * typed track collections and clip metadata.
 */
export function getTimelineTracks<TrackKind = string>(
  tracks: TimelineState['tracks']
): Track<TrackKind>[] {
  return tracks as Track<TrackKind>[];
}
