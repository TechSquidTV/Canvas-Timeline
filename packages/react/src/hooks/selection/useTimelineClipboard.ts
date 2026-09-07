import { timelineCommandFail, timelineCommandOk } from '#react/hooks/core/timelineCommandResult';
import type { TimelineCommandResult } from '#react/hooks/core/timelineCommandResult';
import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { useTimelineExternalStore } from '#react/hooks/core/useTimelineExternalStore';
import { useTimelineSelector } from '#react/hooks/core/useTimelineSelector';
import { useTimelineSelection } from '#react/hooks/selection/useTimelineSelection';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useCallback, useMemo } from 'react';
const clipboardEvents = ['clipboard:change'] as const;

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
  const engine = useTimelineEngine();
  const state = useTimelineSelector((state) => ({ tracks: state.tracks }));
  const { selectedClip } = useTimelineSelection();
  const clipboardCount = useTimelineExternalStore(
    clipboardEvents,
    (engine) => engine.clipboardCount
  );
  const clipboardState = useMemo(
    () => ({
      canCopy: selectedClip !== null,
      canCut: selectedClip !== null,
      canPaste: clipboardCount > 0,
      clipboardCount,
    }),
    [clipboardCount, selectedClip]
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
    const result = engine.cutSelection();
    return result.committed
      ? timelineCommandOk()
      : timelineCommandFail(result.preview.reason ?? 'unsupported', result.preview.message);
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
      const results = engine.pasteSelection(time, targetTrackId);
      if (!results?.length) {
        return timelineCommandFail('not-found');
      }
      const failed = results.find((result) => !result.committed);
      return failed
        ? timelineCommandFail(failed.preview.reason ?? 'unsupported', failed.preview.message)
        : timelineCommandOk();
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
