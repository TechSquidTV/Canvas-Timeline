import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useCallback, useMemo } from 'react';
import { useTimeline } from '#react/hooks/core/useTimeline';
import { useTimelineSelection } from '#react/hooks/selection/useTimelineSelection';
import {
  timelineCommandFail,
  timelineCommandOk,
  type TimelineCommandResult,
} from '#react/hooks/core/timelineCommandResult';

/** Result returned by `useTimelineClipboard`. */
export interface UseTimelineClipboardResult {
  /** Whether the current selection can be copied. */
  canCopy: boolean;
  /** Whether the current selection can be cut. */
  canCut: boolean;
  /** Whether clipboard contents are available to paste. */
  canPaste: boolean;
  /** Number of clips currently stored in the timeline clipboard. */
  clipboardCount: number;
  /** Copies the current clip selection to the timeline clipboard. */
  copySelection: () => TimelineCommandResult;
  /** Cuts the current clip selection to the timeline clipboard. */
  cutSelection: () => TimelineCommandResult;
  /** Pastes clipboard clips at a time and optional target track. */
  pasteSelection: (time: RationalTime, targetTrackId?: string) => TimelineCommandResult;
}

/**
 * Provides access to clipboard operations for copying, cutting, and pasting clips.
 *
 * @returns Commands for manipulating the timeline clip clipboard.
 */
export function useTimelineClipboard(): UseTimelineClipboardResult {
  const { engine, state } = useTimeline();
  const { selectedClip } = useTimelineSelection();
  const clipboardState = useMemo(
    () => ({
      canCopy: selectedClip !== null,
      canCut: selectedClip !== null,
      canPaste: engine.canPasteSelection,
      clipboardCount: engine.clipboardCount,
    }),
    [engine.canPasteSelection, engine.clipboardCount, selectedClip]
  );

  const copySelection = useCallback(() => {
    if (!clipboardState.canCopy) {
      return timelineCommandFail('empty-selection');
    }
    engine.copySelection();
    return timelineCommandOk();
  }, [clipboardState.canCopy, engine]);

  const cutSelection = useCallback(() => {
    if (!clipboardState.canCut) {
      return timelineCommandFail('empty-selection');
    }
    engine.cutSelection();
    return timelineCommandOk();
  }, [clipboardState.canCut, engine]);

  const pasteSelection = useCallback(
    (time: RationalTime, targetTrackId?: string) => {
      if (!clipboardState.canPaste) {
        return timelineCommandFail('empty-clipboard');
      }
      if (
        targetTrackId !== undefined &&
        !state.tracks.some((track) => track.id === targetTrackId)
      ) {
        return timelineCommandFail('not-found');
      }
      engine.pasteSelection(time, targetTrackId);
      return timelineCommandOk();
    },
    [clipboardState.canPaste, engine, state.tracks]
  );

  return useMemo(
    () => ({
      ...clipboardState,
      copySelection,
      cutSelection,
      pasteSelection,
    }),
    [clipboardState, copySelection, cutSelection, pasteSelection]
  );
}
