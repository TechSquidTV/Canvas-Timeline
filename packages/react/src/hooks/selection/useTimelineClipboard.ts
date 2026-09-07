import { runTimelineCommand } from '#react/hooks/core/runTimelineCommand';
import { timelineCommandFail, timelineCommandOk } from '@techsquidtv/canvas-timeline-core';
import type { TimelineCommandResult } from '@techsquidtv/canvas-timeline-core';
import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { useTimelineExternalStore } from '#react/hooks/core/useTimelineExternalStore';
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

  const copySelection = useCallback(
    () =>
      runTimelineCommand(() => {
        if (engine.getSelectedClipIds().length === 0) {
          return timelineCommandFail('empty-selection');
        }
        engine.copySelection();
        return timelineCommandOk();
      }),
    [engine]
  );

  const cutSelection = useCallback(
    () =>
      runTimelineCommand(() => {
        if (engine.getSelectedClipIds().length === 0) {
          return timelineCommandFail('empty-selection');
        }
        const result = engine.cutSelection();
        return result.committed
          ? timelineCommandOk()
          : timelineCommandFail(result.preview.reason ?? 'unsupported', result.preview.message);
      }),
    [engine]
  );

  const pasteSelection = useCallback(
    (time: RationalTime, targetTrackId?: string) =>
      runTimelineCommand(() => {
        if (!engine.canPasteSelection) {
          return timelineCommandFail('empty-clipboard');
        }
        if (
          targetTrackId !== undefined &&
          !engine.tracks.some((track) => track.id === targetTrackId)
        ) {
          return timelineCommandFail('not-found');
        }
        const results = engine.pasteSelection(time, targetTrackId);
        if (!results?.length) {
          return timelineCommandFail('not-found');
        }
        // Earlier valid edits are also uncommitted after rollback; report the rejecting edit.
        const failed = results.find((result) => !result.preview.valid);
        return failed
          ? timelineCommandFail(failed.preview.reason ?? 'unsupported', failed.preview.message)
          : timelineCommandOk();
      }),
    [engine]
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
