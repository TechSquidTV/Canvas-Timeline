import type { Track, TimelineReadonly } from '@techsquidtv/canvas-timeline-core';

/** Resolves the same accessible label for headers and standalone track controls. */
export function getTimelineTrackLabel(
  track: TimelineReadonly<Track> | null,
  trackIndex: number,
  trackId: string
) {
  return track === null ? trackId : (track.name ?? `${track.kind} ${trackIndex + 1}`);
}
