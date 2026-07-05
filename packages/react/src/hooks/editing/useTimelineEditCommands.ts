import { useCallback, useMemo } from 'react';
import type {
  Clip,
  TimelineDeleteRangeEditCommand,
  TimelineEditCommand,
  TimelineEditCommitResult,
  TimelineEditPreview,
  TimelineEditValidationResult,
  TimelineInsertClipGroupEditCommand,
  TimelineInsertEditCommand,
  TimelineMoveEditCommand,
  TimelineOverwriteClipGroupEditCommand,
  TimelineOverwriteEditCommand,
  TimelineRippleTrimEditCommand,
  TimelineRollTrimEditCommand,
  TimelineSlideEditCommand,
  TimelineSplitEditCommand,
  TimelineTrimEditCommand,
} from '@techsquidtv/canvas-timeline-core';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useTimeline } from '../core/useTimeline';
import { useTimelineSelection } from '../selection/useTimelineSelection';
import {
  timelineCommandFail,
  timelineCommandOk,
  type TimelineCommandFailureReason,
  type TimelineCommandResult,
} from '../core/timelineCommandResult';

/** Result returned by `useTimelineEditCommands`. */
export interface UseTimelineEditCommandsResult {
  /** Validates a typed edit command without mutating timeline state. */
  validateEdit: (command: TimelineEditCommand) => TimelineEditValidationResult;
  /** Resolves and publishes a non-mutating command preview. */
  previewEdit: (command: TimelineEditCommand) => TimelineEditPreview;
  /** Commits a typed edit command as one history entry. */
  commitEdit: (command: TimelineEditCommand) => TimelineCommandResult<TimelineEditCommitResult>;
  /** Clears the active command preview. */
  cancelEdit: () => void;
  /** Commits a move command. */
  moveClip: (
    command: Omit<TimelineMoveEditCommand, 'type'>
  ) => TimelineCommandResult<TimelineEditCommitResult>;
  /** Commits a trim command. */
  trimClip: (
    command: Omit<TimelineTrimEditCommand, 'type'>
  ) => TimelineCommandResult<TimelineEditCommitResult>;
  /** Commits a ripple-trim command. */
  rippleTrimClip: (
    command: Omit<TimelineRippleTrimEditCommand, 'type'>
  ) => TimelineCommandResult<TimelineEditCommitResult>;
  /** Commits a roll-trim command. */
  rollTrim: (
    command: Omit<TimelineRollTrimEditCommand, 'type'>
  ) => TimelineCommandResult<TimelineEditCommitResult>;
  /** Commits a slip command. */
  slipClip: (
    clipId: string,
    deltaTime: RationalTime
  ) => TimelineCommandResult<TimelineEditCommitResult>;
  /** Commits a slide command. */
  slideClip: (
    command: Omit<TimelineSlideEditCommand, 'type'>
  ) => TimelineCommandResult<TimelineEditCommitResult>;
  /** Commits a split command for one clip. */
  splitClip: (
    clipId: string,
    time: RationalTime
  ) => TimelineCommandResult<TimelineEditCommitResult>;
  /** Commits a split command for multiple clips. */
  splitClips: (
    command: Omit<TimelineSplitEditCommand, 'type'>
  ) => TimelineCommandResult<TimelineEditCommitResult>;
  /** Splits the current selected clips at a timeline time. */
  splitSelectedClipsAtTime: (time: RationalTime) => TimelineCommandResult<TimelineEditCommitResult>;
  /** Commits an insert command. */
  insertClip: (
    command: Omit<TimelineInsertEditCommand, 'type'>
  ) => TimelineCommandResult<TimelineEditCommitResult>;
  /** Commits a grouped insert command. */
  insertClipGroup: (
    command: Omit<TimelineInsertClipGroupEditCommand, 'type'>
  ) => TimelineCommandResult<TimelineEditCommitResult>;
  /** Commits an overwrite command. */
  overwriteClip: (
    command: Omit<TimelineOverwriteEditCommand, 'type'>
  ) => TimelineCommandResult<TimelineEditCommitResult>;
  /** Commits a grouped overwrite command. */
  overwriteClipGroup: (
    command: Omit<TimelineOverwriteClipGroupEditCommand, 'type'>
  ) => TimelineCommandResult<TimelineEditCommitResult>;
  /** Commits a range delete command. */
  deleteRange: (
    command: Omit<TimelineDeleteRangeEditCommand, 'type'>
  ) => TimelineCommandResult<TimelineEditCommitResult>;
  /** Commits a lift-range command. */
  liftRange: (command: {
    startTime: RationalTime;
    endTime: RationalTime;
    trackIds?: readonly string[];
  }) => TimelineCommandResult<TimelineEditCommitResult>;
}

function toTimelineCommandFailureReason(
  reason: TimelineEditValidationResult['reason']
): TimelineCommandFailureReason {
  return reason ?? 'unsupported';
}

/**
 * Exposes command-layer edit APIs for React product chrome.
 *
 * The hook is a thin adapter over `TimelineEngine` command methods; it does not
 * implement edit math or range mutation rules in React.
 *
 * @returns Typed command builders and generic command-layer APIs.
 */
export function useTimelineEditCommands(): UseTimelineEditCommandsResult {
  const { engine } = useTimeline();
  const { selectedClipIds } = useTimelineSelection();

  const validateEdit = useCallback(
    (command: TimelineEditCommand) => engine.validateEdit(command),
    [engine]
  );

  const previewEdit = useCallback(
    (command: TimelineEditCommand) => engine.previewEdit(command),
    [engine]
  );

  const commitEdit = useCallback(
    (command: TimelineEditCommand) => {
      const result = engine.commitEdit(command);
      return result.committed
        ? timelineCommandOk(result)
        : timelineCommandFail<TimelineEditCommitResult>(
            toTimelineCommandFailureReason(result.preview.reason),
            result.preview.message
          );
    },
    [engine]
  );

  const cancelEdit = useCallback(() => {
    engine.cancelEdit();
  }, [engine]);

  return useMemo(
    () => ({
      validateEdit,
      previewEdit,
      commitEdit,
      cancelEdit,
      moveClip: (command) => commitEdit({ type: 'move', ...command }),
      trimClip: (command) => commitEdit({ type: 'trim', ...command }),
      rippleTrimClip: (command) => commitEdit({ type: 'ripple-trim', ...command }),
      rollTrim: (command) => commitEdit({ type: 'roll-trim', ...command }),
      slipClip: (clipId: string, deltaTime: RationalTime) =>
        commitEdit({ type: 'slip', clipId, deltaTime }),
      slideClip: (command) => commitEdit({ type: 'slide', ...command }),
      splitClip: (clipId: string, time: RationalTime) =>
        commitEdit({ type: 'split', clipIds: [clipId], time }),
      splitClips: (command) => commitEdit({ type: 'split', ...command }),
      splitSelectedClipsAtTime: (time: RationalTime) =>
        commitEdit({ type: 'split', clipIds: selectedClipIds, time }),
      insertClip: (command: {
        clip: Clip;
        targetTrackId: string;
        startTime: RationalTime;
        snap?: boolean;
      }) => commitEdit({ type: 'insert', ...command }),
      insertClipGroup: (command) => commitEdit({ type: 'insert-clip-group', ...command }),
      overwriteClip: (command: {
        clip: Clip;
        targetTrackId: string;
        startTime: RationalTime;
        snap?: boolean;
      }) => commitEdit({ type: 'overwrite', ...command }),
      overwriteClipGroup: (command) => commitEdit({ type: 'overwrite-clip-group', ...command }),
      deleteRange: (command) => commitEdit({ type: 'delete-range', ...command }),
      liftRange: (command) => commitEdit({ type: 'lift-range', ...command }),
    }),
    [cancelEdit, commitEdit, previewEdit, selectedClipIds, validateEdit]
  );
}
