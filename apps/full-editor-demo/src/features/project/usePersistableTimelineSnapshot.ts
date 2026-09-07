import { isEditorTrack } from '#full-editor/features/project/demo-project';
import { sanitizePersistedTimelineState } from '#full-editor/infrastructure/persistence/project/timeline-state-persistence';
import type { PersistedTimelineState } from '#full-editor/infrastructure/persistence/project/types';
import {
  useTimelineScrollLeft,
  useTimelineScrollTop,
  useTimelineState,
  useTimelineZoomScale,
} from '@techsquidtv/canvas-timeline-react';
import { useMemo } from 'react';
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
  const scrollLeft = useTimelineScrollLeft();
  const scrollTop = useTimelineScrollTop();
  const zoomScale = useTimelineZoomScale();

  const contentState = useMemo<PersistedTimelineContentState>(() => {
    const sanitizedState = sanitizePersistedTimelineState({
      clipGroups: state.clipGroups,
      duration: state.duration,
      inPoint: state.inPoint,
      markers: state.markers ?? [],
      outPoint: state.outPoint,
      playheadTime: { v: 0, r: 60000 },
      scrollLeft: 0,
      scrollTop: 0,
      snapEnabled: state.snapEnabled,
      snapThresholdPixels: state.snapThresholdPixels,
      tracks: state.tracks.map((track) => {
        if (!isEditorTrack(track)) {
          throw new Error(`Unsupported editor track kind: ${track.kind}`);
        }
        return track;
      }),
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
    state.clipGroups,
    state.markers,
    state.inPoint,
    state.outPoint,
    state.snapEnabled,
    state.snapThresholdPixels,
    state.duration,
    state.tracks,
  ]);

  const timelineState = useMemo(
    () => ({
      ...contentState,
      playheadTime: { ...state.playheadTime },
      scrollLeft,
      scrollTop,
      zoomScale,
    }),
    [contentState, scrollLeft, scrollTop, state.playheadTime, zoomScale]
  );

  const contentFingerprint = useMemo(() => JSON.stringify(contentState), [contentState]);
  const liveFingerprint = `${timelineState.playheadTime.v}:${timelineState.playheadTime.r}:${timelineState.scrollLeft}:${timelineState.scrollTop}:${timelineState.zoomScale}`;
  const fingerprint = `${contentFingerprint}:${liveFingerprint}`;

  return { fingerprint, timelineState };
}
