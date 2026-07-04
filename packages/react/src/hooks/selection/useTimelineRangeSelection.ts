import { useCallback, useMemo } from 'react';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import type { TimelineEditCommitResult } from '@techsquidtv/canvas-timeline-core';
import { useTimeline } from '../core/useTimeline';
import { useTimelineEditCommands } from '../editing/useTimelineEditCommands';
import type { TimelineCommandResult } from '../core/timelineCommandResult';

/** Timeline range selected for range edit commands. */
export interface TimelineRangeSelection {
  /** Inclusive selected range start. */
  startTime: RationalTime;
  /** Exclusive selected range end. */
  endTime: RationalTime;
}

/** Result returned by `useTimelineRangeSelection`. */
export interface UseTimelineRangeSelectionResult {
  /** Selected timeline range, or null when both boundaries are not set. */
  range: TimelineRangeSelection | null;
  /** Whether a complete range is selected. */
  hasRange: boolean;
  /** Sets both range boundaries. */
  setRange: (range: TimelineRangeSelection) => void;
  /** Clears the range boundaries. */
  clearRange: () => void;
  /** Deletes the selected range, closing the gap by default. */
  deleteRange: (options?: {
    trackIds?: readonly string[];
    ripple?: boolean;
  }) => TimelineCommandResult<TimelineEditCommitResult>;
  /** Lifts the selected range while leaving the gap in place. */
  liftRange: (options?: {
    trackIds?: readonly string[];
  }) => TimelineCommandResult<TimelineEditCommitResult>;
}

/**
 * Adapts timeline In/Out points to command-layer range selection.
 *
 * The hook treats a complete In/Out pair as the selected edit range and delegates
 * range mutations to `useTimelineEditCommands`.
 *
 * @returns Range selection state and range edit commands.
 */
export function useTimelineRangeSelection(): UseTimelineRangeSelectionResult {
  const { engine, state } = useTimeline();
  const { deleteRange: commitDeleteRange, liftRange: commitLiftRange } = useTimelineEditCommands();
  const range = useMemo(() => {
    if (state.inPoint === undefined || state.outPoint === undefined) {
      return null;
    }
    return {
      startTime: state.inPoint,
      endTime: state.outPoint,
    };
  }, [state.inPoint, state.outPoint]);

  const setRange = useCallback(
    (nextRange: TimelineRangeSelection) => {
      engine.setInPoint(nextRange.startTime);
      engine.setOutPoint(nextRange.endTime);
    },
    [engine]
  );

  const clearRange = useCallback(() => {
    engine.clearInOutPoints();
  }, [engine]);

  const deleteRange = useCallback(
    (options: { trackIds?: readonly string[]; ripple?: boolean } = {}) => {
      if (range === null) {
        return { ok: false as const, reason: 'invalid-range' as const };
      }
      return commitDeleteRange({
        startTime: range.startTime,
        endTime: range.endTime,
        trackIds: options.trackIds,
        ripple: options.ripple,
      });
    },
    [commitDeleteRange, range]
  );

  const liftRange = useCallback(
    (options: { trackIds?: readonly string[] } = {}) => {
      if (range === null) {
        return { ok: false as const, reason: 'invalid-range' as const };
      }
      return commitLiftRange({
        startTime: range.startTime,
        endTime: range.endTime,
        trackIds: options.trackIds,
      });
    },
    [commitLiftRange, range]
  );

  return useMemo(
    () => ({
      range,
      hasRange: range !== null,
      setRange,
      clearRange,
      deleteRange,
      liftRange,
    }),
    [clearRange, deleteRange, liftRange, range, setRange]
  );
}
