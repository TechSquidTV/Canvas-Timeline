import type { TimelineClipLookup } from '#core/engine/types';
import type { TimelineClipEntry, TimelineReadonly, Track } from '#core/types';

export function findClipInTracks(
  tracks: readonly Track[],
  clipId: string
): TimelineClipLookup | undefined;
export function findClipInTracks(
  tracks: readonly TimelineReadonly<Track>[],
  clipId: string
): TimelineClipEntry | undefined;
/** Shared lookup for private mutable models and public readonly snapshots. */
export function findClipInTracks(
  tracks: readonly TimelineReadonly<Track>[],
  clipId: string
): TimelineClipEntry | undefined {
  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const track = tracks[trackIndex];
    for (let clipIndex = 0; clipIndex < track.clips.length; clipIndex++) {
      const clip = track.clips[clipIndex];
      if (clip.id === clipId) {
        return { track, clip, trackIndex, clipIndex };
      }
    }
  }
  return undefined;
}
