import type { Track } from '@techsquidtv/canvas-timeline-core';
import type { EditorTrackKind } from '#full-editor/data/demo-project';

export function countTimelineSourceUsage(tracks: readonly Track<EditorTrackKind>[]) {
  const usageCounts = new Map<string, number>();

  for (const track of tracks) {
    for (const clip of track.clips) {
      usageCounts.set(clip.sourceId, (usageCounts.get(clip.sourceId) ?? 0) + 1);
    }
  }

  return usageCounts;
}
