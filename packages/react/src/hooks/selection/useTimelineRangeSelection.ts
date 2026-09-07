import { timelineCommandOk, timelineCommandFail } from '@techsquidtv/canvas-timeline-core';
import type {
  TimelineCommandResult,
  TimelineEditCommitResult,
} from '@techsquidtv/canvas-timeline-core';
import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { useTimelineSelector } from '#react/hooks/core/useTimelineSelector';
import { useTimelineEditCommands } from '#react/hooks/editing/useTimelineEditCommands';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useCallback, useMemo } from 'react';
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
  setRange: (range: TimelineRangeSelection) => TimelineCommandResult;
  /** Clears the range boundaries. */
  clearRange: () => TimelineCommandResult;
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
  const engine = useTimelineEngine();
  const state = useTimelineSelector((state) => ({
    inPoint: state.inPoint,
    outPoint: state.outPoint,
  }));
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
      return engine.setInOutRange(nextRange.startTime, nextRange.endTime);
    },
    [engine]
  );

  const clearRange = useCallback(() => {
    engine.clearInOutPoints();
    return timelineCommandOk();
  }, [engine]);

  const deleteRange = useCallback(
    (options: { trackIds?: readonly string[]; ripple?: boolean } = {}) => {
      const { inPoint, outPoint } = engine.getState();
      if (inPoint === undefined || outPoint === undefined) {
        return timelineCommandFail<TimelineEditCommitResult>('invalid-range');
      }
      return commitDeleteRange({
        startTime: inPoint,
        endTime: outPoint,
        trackIds: options.trackIds,
        ripple: options.ripple,
      });
    },
    [commitDeleteRange, engine]
  );

  const liftRange = useCallback(
    (options: { trackIds?: readonly string[] } = {}) => {
      const { inPoint, outPoint } = engine.getState();
      if (inPoint === undefined || outPoint === undefined) {
        return timelineCommandFail<TimelineEditCommitResult>('invalid-range');
      }
      return commitLiftRange({
        startTime: inPoint,
        endTime: outPoint,
        trackIds: options.trackIds,
      });
    },
    [commitLiftRange, engine]
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
