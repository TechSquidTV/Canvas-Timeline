import { timelineCommandOk } from '@techsquidtv/canvas-timeline-core';
import type { TimelineCommandResult } from '@techsquidtv/canvas-timeline-core';
import { deriveTimelineSelection } from '#react/hooks/clips/timelineClipModel';
import type { TimelineSelectionState } from '#react/hooks/clips/timelineClipModel';
import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { useTimelineSelector } from '#react/hooks/core/useTimelineSelector';
import { useCallback, useMemo } from 'react';
export type { TimelineSelectionState } from '#react/hooks/clips/timelineClipModel';

/**
 * Result returned by `useTimelineSelection`.
 *
 * @remarks
 *
 * The result is the shared selection model used by clip inspectors, track
 * headers, grouping controls, clipboard commands, and edit toolbars. It
 * includes both primary selection fields and multi-selection arrays so product
 * chrome can avoid re-deriving selection from raw tracks.
 *
 *
 * @see {@link useTimelineClips}
 * @see {@link https://canvastimeline.com/docs/react-hooks | React editor hooks}
 */
export interface UseTimelineSelectionResult extends TimelineSelectionState {
  /** Selects a clip by id, or clears clip selection when passed null. */
  selectClip: (clipId: string | null) => TimelineCommandResult;
  /** Selects multiple clips by id, clearing clips not included. */
  selectClips: (clipIds: readonly string[]) => TimelineCommandResult;
  /** Toggles one clip in the current multi-selection. */
  toggleClipSelection: (clipId: string, selected?: boolean) => TimelineCommandResult;
  /** Selects a track by id, or clears track selection when passed null. */
  selectTrack: (trackId: string | null) => TimelineCommandResult;
  /** Clears both clip and track selection. */
  clearSelection: () => TimelineCommandResult;
}

/**
 * Provides the canonical selected clip/track model for timeline editor chrome.
 *
 * @remarks
 *
 * Use this hook when UI needs selection state without the broader clip command
 * surface from {@link useTimelineClips}. It is a good fit for inspectors,
 * selection badges, grouped-clip panels, and toolbar enablement.
 *
 * @returns Selected clip and track state plus selection commands.
 *
 * @example
 * ```tsx
 * import { useTimelineSelection } from '@techsquidtv/canvas-timeline-react';
 *
 * export function SelectionSummary() {
 *   const selection = useTimelineSelection();
 *
 *   if (!selection.hasSelection) {
 *     return <p>No selection</p>;
 *   }
 *
 *   return (
 *     <p>
 *       {selection.selectedClipIds.length} clips selected
 *       {selection.selectedTrack ? ` on ${selection.selectedTrack.name}` : ''}
 *     </p>
 *   );
 * }
 * ```
 *
 * @see {@link useTimelineClips}
 * @see {@link https://canvastimeline.com/demos/clip-grouping-import | Clip grouping import demo}
 */
export function useTimelineSelection(): UseTimelineSelectionResult {
  const engine = useTimelineEngine();
  const state = useTimelineSelector((state) => ({
    clipGroups: state.clipGroups,
    tracks: state.tracks,
  }));
  const selection = useMemo(
    () => deriveTimelineSelection(state.tracks, state.clipGroups),
    [state.clipGroups, state.tracks]
  );

  const selectClip = useCallback(
    (clipId: string | null) => {
      return engine.selectClip(clipId);
    },
    [engine]
  );

  const selectTrack = useCallback(
    (trackId: string | null) => {
      return engine.selectTrack(trackId);
    },
    [engine]
  );

  const selectClips = useCallback(
    (clipIds: readonly string[]) => {
      return engine.selectClips(clipIds);
    },
    [engine]
  );

  const toggleClipSelection = useCallback(
    (clipId: string, selected?: boolean) => engine.toggleClipSelection(clipId, selected),
    [engine]
  );

  const clearSelection = useCallback(() => {
    engine.selectClip(null);
    engine.selectTrack(null);
    return timelineCommandOk();
  }, [engine]);

  return {
    ...selection,
    selectClip,
    selectClips,
    toggleClipSelection,
    selectTrack,
    clearSelection,
  };
}
