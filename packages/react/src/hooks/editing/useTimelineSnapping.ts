import { runTimelineCommand } from '#react/hooks/core/runTimelineCommand';
import { timelineCommandOk } from '@techsquidtv/canvas-timeline-core';
import type {
  TimelineCommandResult,
  TimelineReadonly,
  SnapPreparationOptions,
  TimelineSnapFeedback,
  TimelineSnapResult,
  TimelineSnapTarget,
} from '@techsquidtv/canvas-timeline-core';
import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { useTimelineSelector } from '#react/hooks/core/useTimelineSelector';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useCallback, useMemo } from 'react';
/** Result returned by `useTimelineSnapping`. */
export interface UseTimelineSnappingResult {
  /** Whether magnetic snapping is enabled. */
  enabled: boolean;
  /** Magnetic snap radius in screen pixels. */
  thresholdPixels: number;
  /** Current transient snap feedback for canvas guides and UI status. */
  feedback: TimelineReadonly<TimelineSnapFeedback>;
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
  const engine = useTimelineEngine();
  const state = useTimelineSelector((state) => ({
    snapEnabled: state.snapEnabled,
    snapFeedback: state.snapFeedback,
    snapThresholdPixels: state.snapThresholdPixels,
  }));

  const setEnabled = useCallback(
    (enabled: boolean) =>
      runTimelineCommand(() => {
        engine.setSnappingEnabled(enabled);
        return timelineCommandOk();
      }),
    [engine]
  );

  const setThresholdPixels = useCallback(
    (thresholdPixels: number) =>
      runTimelineCommand(() => {
        engine.setSnapThresholdPixels(thresholdPixels);
        return timelineCommandOk();
      }),
    [engine]
  );

  const prepareSnapping = useCallback(
    (options?: string | SnapPreparationOptions) =>
      runTimelineCommand(() => {
        engine.prepareSnapping(options);
        return timelineCommandOk();
      }),
    [engine]
  );

  const resolveSnap = useCallback(
    (time: RationalTime, publishFeedback?: boolean) => engine.resolveSnap(time, publishFeedback),
    [engine]
  );

  const settle = useCallback(
    () =>
      runTimelineCommand(() => {
        engine.settle();
        return timelineCommandOk();
      }),
    [engine]
  );

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
