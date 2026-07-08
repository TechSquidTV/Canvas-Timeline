import type { Track, Clip, Marker } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { getDemoClipColor } from '#www/demos/demo-clip-colors';

export function generateStressTestData(
  numTracks: number,
  clipsPerTrack: number,
  durationSeconds: number
) {
  const tracks: Track<'visual' | 'audio'>[] = [];
  const segmentWidth = durationSeconds / Math.max(1, clipsPerTrack);
  const clipDuration = segmentWidth * 0.7; // clip takes 70% of segment
  const gapDuration = segmentWidth * 0.3; // gap takes 30% of segment

  for (let t = 0; t < numTracks; t++) {
    const trackId = `track-${t}`;
    const kind = t % 2 === 0 ? 'visual' : 'audio';
    const clips: Clip[] = [];

    for (let c = 0; c < clipsPerTrack; c++) {
      // Add slight track stagger to make the timeline look realistic and dense
      const stagger = (t % 4) * (gapDuration / 4);
      const startSec = c * segmentWidth + stagger;
      const endSec = Math.min(startSec + clipDuration, durationSeconds);

      if (startSec < durationSeconds && startSec < endSec) {
        clips.push({
          id: `clip-${t}-${c}`,
          sourceId: `source-${t}-${c}`,
          timelineStart: fromSeconds(startSec),
          timelineEnd: fromSeconds(endSec),
          sourceStart: fromSeconds(0),
          selected: false,
          color: getDemoClipColor(t * clipsPerTrack + c),
          label: `Trk ${t + 1} Clp ${c + 1}`,
        });
      }
    }

    tracks.push({
      id: trackId,
      kind,
      name: `${kind.toUpperCase()} Track ${t + 1}`,
      locked: false,
      muted: false,
      visible: true,
      selected: false,
      height: 40,
      clips,
    });
  }

  // Generate some markers along the timeline
  const markers: Marker[] = [];
  const numMarkers = Math.min(20, Math.floor(durationSeconds / 15));
  for (let m = 0; m < numMarkers; m++) {
    const timeSec = (m + 1) * (durationSeconds / (numMarkers + 1));
    markers.push({
      id: `marker-${m}`,
      time: fromSeconds(timeSec),
      label: `M${m + 1}`,
    });
  }

  return { tracks, markers };
}

// Default initial state
export const initialNumTracks = 15;
export const initialClipsPerTrack = 8;
export const initialDurationSeconds = 120;
