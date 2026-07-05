import {
  useTimelineMarkers,
  useTimelinePlayback,
  useTimelinePlayheadTime,
  useTimelineScrollLeft,
  useTimelineScrollTop,
  useTimelineSnapping,
  useTimelineState,
  useTimelineTracks,
  useTimelineZoomScale,
} from '@techsquidtv/canvas-timeline-react';
import { useMemo } from 'react';
import type { EditorTrackKind } from '@/data/demo-project';
import type { PersistedTimelineState } from '@/persistence/project/types';
import { sanitizePersistedTimelineState } from '@/persistence/project/project-store';

export interface PersistableTimelineSnapshot {
  fingerprint: string;
  timelineState: PersistedTimelineState;
}

export function usePersistableTimelineSnapshot(): PersistableTimelineSnapshot {
  const state = useTimelineState();
  const markers = useTimelineMarkers();
  const playback = useTimelinePlayback();
  const playheadTime = useTimelinePlayheadTime();
  const scrollLeft = useTimelineScrollLeft();
  const scrollTop = useTimelineScrollTop();
  const snapping = useTimelineSnapping();
  const tracks = useTimelineTracks<EditorTrackKind>();
  const zoomScale = useTimelineZoomScale();

  const timelineState = useMemo(
    () =>
      sanitizePersistedTimelineState({
        duration: state.duration,
        inPoint: playback.inPoint,
        markers: markers.markers,
        outPoint: playback.outPoint,
        playheadTime,
        scrollLeft,
        scrollTop,
        snapEnabled: snapping.enabled,
        snapThresholdPixels: snapping.thresholdPixels,
        tracks: tracks.tracks,
        zoomScale,
      }),
    [
      markers.markers,
      playback.inPoint,
      playback.outPoint,
      playheadTime,
      scrollLeft,
      scrollTop,
      snapping.enabled,
      snapping.thresholdPixels,
      state.duration,
      tracks.tracks,
      zoomScale,
    ]
  );

  const fingerprint = useMemo(() => JSON.stringify(timelineState), [timelineState]);

  return { fingerprint, timelineState };
}
