import { useCallback, useMemo } from 'react';
import type { Track } from '@techsquidtv/canvas-timeline-core';
import { useTimeline } from '../core/useTimeline';
import { deriveTimelineSelection, type TimelineSelectionState } from '../clips/timelineClipModel';

export type { TimelineSelectionState } from '../clips/timelineClipModel';

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
 * @template TrackKind - App-defined track kind values carried by selected
 * tracks.
 *
 * @see {@link useTimelineClips}
 * @see {@link https://canvastimeline.com/docs/react-hooks | React editor hooks}
 */
export interface UseTimelineSelectionResult<
  TrackKind = string,
> extends TimelineSelectionState<TrackKind> {
  /** Selects a clip by id, or clears clip selection when passed null. */
  selectClip: (clipId: string | null) => void;
  /** Selects multiple clips by id, clearing clips not included. */
  selectClips: (clipIds: readonly string[]) => void;
  /** Toggles one clip in the current multi-selection. */
  toggleClipSelection: (clipId: string, selected?: boolean) => boolean;
  /** Selects a track by id, or clears track selection when passed null. */
  selectTrack: (trackId: string | null) => void;
  /** Clears both clip and track selection. */
  clearSelection: () => void;
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
 * @template TrackKind - App-defined track kind values carried by selected
 * tracks.
 *
 * @example
 * ```tsx
 * import { useTimelineSelection } from '@techsquidtv/canvas-timeline-react/hooks';
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
export function useTimelineSelection<TrackKind = string>(): UseTimelineSelectionResult<TrackKind> {
  const { engine, state } = useTimeline();
  const selection = useMemo(
    () => deriveTimelineSelection(state.tracks as Track<TrackKind>[], state.clipGroups),
    [state.clipGroups, state.tracks]
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

  const selectClips = useCallback(
    (clipIds: readonly string[]) => {
      engine.selectClips(clipIds);
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
