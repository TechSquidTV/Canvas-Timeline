import { useCallback, useMemo } from 'react';
import type {
  SnapPreparationOptions,
  TimelineSnapFeedback,
  TimelineSnapResult,
  TimelineSnapTarget,
} from '@techsquidtv/canvas-timeline-core';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useTimeline } from '../core/useTimeline';
import { timelineCommandOk, type TimelineCommandResult } from '../core/timelineCommandResult';

/** Result returned by `useTimelineSnapping`. */
export interface UseTimelineSnappingResult {
  /** Whether magnetic snapping is enabled. */
  enabled: boolean;
  /** Magnetic snap radius in screen pixels. */
  thresholdPixels: number;
  /** Current transient snap feedback for canvas guides and UI status. */
  feedback: TimelineSnapFeedback;
  /** Currently active snap target, or null when nothing is snapped. */
  activeTarget: TimelineSnapTarget | null;
  /** Enables or disables magnetic snapping. */
  setEnabled: (enabled: boolean) => TimelineCommandResult;
  /** Sets the magnetic snap radius in screen pixels. */
  setThresholdPixels: (thresholdPixels: number) => TimelineCommandResult;
  /** Prepares snap targets for an upcoming interaction. */
  prepareSnapping: (options?: string | SnapPreparationOptions) => TimelineCommandResult;
  /** Resolves a candidate time against the prepared snap target index. */
  resolveSnap: (time: RationalTime, publishFeedback?: boolean) => TimelineSnapResult | null;
  /** Finalizes an interaction and clears transient snap feedback. */
  settle: () => TimelineCommandResult;
}

/**
 * Provides the canonical snapping state and commands for editor UI.
 *
 * @returns Snap settings, active feedback, and commands for preparing/resolving snap targets.
 */
export function useTimelineSnapping(): UseTimelineSnappingResult {
  const { engine, state } = useTimeline();

  const setEnabled = useCallback(
    (enabled: boolean) => {
      engine.setSnappingEnabled(enabled);
      return timelineCommandOk();
    },
    [engine]
  );

  const setThresholdPixels = useCallback(
    (thresholdPixels: number) => {
      engine.setSnapThresholdPixels(thresholdPixels);
      return timelineCommandOk();
    },
    [engine]
  );

  const prepareSnapping = useCallback(
    (options?: string | SnapPreparationOptions) => {
      engine.prepareSnapping(options);
      return timelineCommandOk();
    },
    [engine]
  );

  const resolveSnap = useCallback(
    (time: RationalTime, publishFeedback?: boolean) => engine.resolveSnap(time, publishFeedback),
    [engine]
  );

  const settle = useCallback(() => {
    engine.settle();
    return timelineCommandOk();
  }, [engine]);

  return useMemo(
    () => ({
      enabled: state.snapEnabled,
      thresholdPixels: state.snapThresholdPixels,
      feedback: state.snapFeedback,
      activeTarget: state.snapFeedback.target,
      setEnabled,
      setThresholdPixels,
      prepareSnapping,
      resolveSnap,
      settle,
    }),
    [
      prepareSnapping,
      resolveSnap,
      setEnabled,
      setThresholdPixels,
      settle,
      state.snapEnabled,
      state.snapFeedback,
      state.snapThresholdPixels,
    ]
  );
}
