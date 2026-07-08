import {
  useTimelineClipGroups,
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
import type { EditorTrackKind } from '#full-editor/data/demo-project';
import type { PersistedTimelineState } from '#full-editor/persistence/project/types';
import { sanitizePersistedTimelineState } from '#full-editor/persistence/project/timeline-state-persistence';

type PersistedTimelineContentState = Omit<
  PersistedTimelineState,
  'playheadTime' | 'scrollLeft' | 'scrollTop' | 'zoomScale'
>;

export interface PersistableTimelineSnapshot {
  fingerprint: string;
  timelineState: PersistedTimelineState;
}

export function usePersistableTimelineSnapshot(): PersistableTimelineSnapshot {
  const state = useTimelineState();
  const clipGroups = useTimelineClipGroups();
  const markers = useTimelineMarkers();
  const playback = useTimelinePlayback();
  const playheadTime = useTimelinePlayheadTime();
  const scrollLeft = useTimelineScrollLeft();
  const scrollTop = useTimelineScrollTop();
  const snapping = useTimelineSnapping();
  const tracks = useTimelineTracks<EditorTrackKind>();
  const zoomScale = useTimelineZoomScale();

  const contentState = useMemo<PersistedTimelineContentState>(() => {
    const sanitizedState = sanitizePersistedTimelineState({
      clipGroups: clipGroups.groups,
      duration: state.duration,
      inPoint: playback.inPoint,
      markers: markers.markers,
      outPoint: playback.outPoint,
      playheadTime: { v: 0, r: 60000 },
      scrollLeft: 0,
      scrollTop: 0,
      snapEnabled: snapping.enabled,
      snapThresholdPixels: snapping.thresholdPixels,
      tracks: tracks.tracks,
      zoomScale: 1,
    });
    return {
      clipGroups: sanitizedState.clipGroups,
      duration: sanitizedState.duration,
      inPoint: sanitizedState.inPoint,
      markers: sanitizedState.markers,
      outPoint: sanitizedState.outPoint,
      snapEnabled: sanitizedState.snapEnabled,
      snapThresholdPixels: sanitizedState.snapThresholdPixels,
      tracks: sanitizedState.tracks,
    };
  }, [
    clipGroups.groups,
    markers.markers,
    playback.inPoint,
    playback.outPoint,
    snapping.enabled,
    snapping.thresholdPixels,
    state.duration,
    tracks.tracks,
  ]);

  const timelineState = useMemo(
    () => ({
      ...contentState,
      playheadTime: { ...playheadTime },
      scrollLeft,
      scrollTop,
      zoomScale,
    }),
    [contentState, playheadTime, scrollLeft, scrollTop, zoomScale]
  );

  const contentFingerprint = useMemo(() => JSON.stringify(contentState), [contentState]);
  const liveFingerprint = `${timelineState.playheadTime.v}:${timelineState.playheadTime.r}:${timelineState.scrollLeft}:${timelineState.scrollTop}:${timelineState.zoomScale}`;
  const fingerprint = `${contentFingerprint}:${liveFingerprint}`;

  return { fingerprint, timelineState };
}
