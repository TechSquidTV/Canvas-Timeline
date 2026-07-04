import { useCallback, useMemo } from 'react';
import type { Track } from '@techsquidtv/canvas-timeline-core';
import { useTimeline } from '../core/useTimeline';
import { deriveTimelineSelection, type TimelineSelectionState } from '../clips/timelineClipModel';

export type { TimelineSelectionState } from '../clips/timelineClipModel';

/** Result returned by `useTimelineSelection`. */
export interface UseTimelineSelectionResult<
  TrackKind = string,
> extends TimelineSelectionState<TrackKind> {
  /** Selects a clip by id, or clears clip selection when passed null. */
  selectClip: (clipId: string | null) => void;
  /** Selects a track by id, or clears track selection when passed null. */
  selectTrack: (trackId: string | null) => void;
  /** Clears both clip and track selection. */
  clearSelection: () => void;
}

/**
 * Provides the canonical selected clip/track model for timeline editor chrome.
 *
 * @returns Selected clip and track state plus selection commands.
 */
export function useTimelineSelection<TrackKind = string>(): UseTimelineSelectionResult<TrackKind> {
  const { engine, state } = useTimeline();
  const selection = useMemo(
    () => deriveTimelineSelection(state.tracks as Track<TrackKind>[]),
    [state.tracks]
  );

  const selectClip = useCallback(
    (clipId: string | null) => {
      engine.selectClip(clipId);
    },
    [engine]
  );

  const selectTrack = useCallback(
    (trackId: string | null) => {
      engine.selectTrack(trackId);
    },
    [engine]
  );

  const clearSelection = useCallback(() => {
    engine.selectClip(null);
    engine.selectTrack(null);
  }, [engine]);

  return {
    ...selection,
    selectClip,
    selectTrack,
    clearSelection,
  };
}
