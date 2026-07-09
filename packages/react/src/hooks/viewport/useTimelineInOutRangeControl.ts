import { useCallback, useMemo, useRef } from 'react';
import { clamp, fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { formatTimelineRangeValue, formatTimelineTimeValue } from '#react/accessibility';
import type { TimelineControlCommitDetails } from '#react/hooks/core/timelineControlEvents';
import { useTimeline } from '#react/hooks/core/useTimeline';

/**
 * Options for adapting timeline In/Out points to a range control.
 */
export interface TimelineInOutRangeControlOptions {
  /** Minimum timeline time in seconds. Defaults to 0. */
  min?: number;
  /** Maximum timeline time in seconds. Defaults to timeline duration or 100. */
  max?: number;
  /** Whether pointer-driven changes should snap to timeline targets. */
  snap?: boolean;
  /** Slider step in seconds for consumers using slider primitives. */
  step?: number;
  /** Accessible label for the in-point thumb. */
  inLabel?: string;
  /** Accessible label for the out-point thumb. */
  outLabel?: string;
  /**
   * Called after the hook applies a committed range value to the engine.
   *
   * When the underlying range control provides commit details, Canvas Timeline
   * forwards them unchanged as the second argument and does not read their
   * fields.
   */
  onValueCommitted?: (
    value: readonly number[],
    eventDetails?: TimelineControlCommitDetails
  ) => void;
}

/**
 * Change metadata emitted by Base UI range slider interactions.
 */
export interface RangeChangeDetails {
  /** Index of the thumb that produced the value change. */
  activeThumbIndex?: number;
  /** Base UI interaction reason for the value change. */
  reason?: string;
}

/**
 * Adapts timeline In/Out points to a Base UI-compatible range slider.
 *
 * The hook keeps loop or export boundaries in sync with `TimelineEngine`
 * `inPoint` and `outPoint` values while returning semantic labels and
 * `aria-valuetext` strings for each thumb. `Timeline.RangeSelector.Root` uses
 * this hook internally; consumers can call it directly when composing their own
 * Base UI slider surface.
 *
 * @param options - Optional bounds, step size, thumb labels, and commit callback.
 * @returns Current In/Out values in seconds, formatted range text, engine commands, and props for range slider root and thumbs.
 *
 * @example
 * ```tsx
 * const range = useTimelineInOutRangeControl();
 *
 * return (
 *   <Slider.Root {...range.rootProps}>
 *     <Slider.Control>
 *       <Slider.Track>
 *         <Slider.Indicator />
 *         <Slider.Thumb index={0} {...range.inThumbProps} />
 *         <Slider.Thumb index={1} {...range.outThumbProps} />
 *       </Slider.Track>
 *     </Slider.Control>
 *   </Slider.Root>
 * );
 * ```
 */
export function useTimelineInOutRangeControl(options: TimelineInOutRangeControlOptions = {}) {
  const {
    inLabel,
    max: optionMax,
    min: optionMin,
    onValueCommitted,
    outLabel,
    snap = false,
    step,
  } = options;
  const { engine, state } = useTimeline();
  const preparedSnapIndexRef = useRef<number | null>(null);
  const control = useMemo(() => {
    const min = optionMin ?? 0;
    const max = optionMax ?? (state.duration ? toSeconds(state.duration) : 100);
    const value: [number, number] = [
      state.inPoint ? toSeconds(state.inPoint) : min,
      state.outPoint ? toSeconds(state.outPoint) : max,
    ];

    return {
      inValueText: formatTimelineTimeValue(value[0]),
      max,
      min,
      outValueText: formatTimelineTimeValue(value[1]),
      step: step ?? 0.01,
      value,
      valueText: formatTimelineRangeValue(value[0], value[1], { includeDuration: true }),
    };
  }, [optionMax, optionMin, state.duration, state.inPoint, state.outPoint, step]);

  const setValue = useCallback(
    (nextValue: number[], eventDetails?: RangeChangeDetails) => {
      const activeThumbIndex = eventDetails?.activeThumbIndex;
      const shouldSnap =
        snap && (eventDetails?.reason === 'drag' || eventDetails?.reason === 'track-press');

      if (!shouldSnap) {
        preparedSnapIndexRef.current = null;
      } else if (preparedSnapIndexRef.current !== (activeThumbIndex ?? -1)) {
        engine.prepareSnapping({
          ignoreInPoint: activeThumbIndex === 0,
          ignoreOutPoint: activeThumbIndex === 1,
        });
        preparedSnapIndexRef.current = activeThumbIndex ?? -1;
      }

      const nextIn =
        nextValue[0] === undefined ? undefined : clamp(nextValue[0], control.min, control.max);
      const nextOut =
        nextValue[1] === undefined ? undefined : clamp(nextValue[1], control.min, control.max);

      if (nextIn !== undefined && nextIn !== control.value[0]) {
        engine.setInPoint(fromSeconds(nextIn), shouldSnap && activeThumbIndex === 0);
      }
      if (nextOut !== undefined && nextOut !== control.value[1]) {
        engine.setOutPoint(fromSeconds(nextOut), shouldSnap && activeThumbIndex === 1);
      }
    },
    [control.max, control.min, control.value, engine, snap]
  );

  const clear = useCallback(() => {
    engine.clearInOutPoints();
  }, [engine]);

  const commit = useCallback(
    (nextValue = control.value) => {
      setValue([...nextValue]);
      engine.settle();
    },
    [control.value, engine, setValue]
  );

  return useMemo(
    () => ({
      /** Maximum timeline boundary time in seconds. */
      max: control.max,
      /** Minimum timeline boundary time in seconds. */
      min: control.min,
      /** Slider step in seconds. */
      step: control.step,
      /** Current `[inPoint, outPoint]` values in seconds. */
      value: control.value,
      /** Formatted range summary for assistive technology. */
      valueText: control.valueText,
      /** Formatted in-point value for assistive technology. */
      inValueText: control.inValueText,
      /** Formatted out-point value for assistive technology. */
      outValueText: control.outValueText,
      /** Updates In/Out points from second values without settling history. */
      setValue,
      /** Clears both In and Out points. */
      clear,
      /** Updates In/Out points and settles the engine interaction. */
      commit,
      /** Formats a timeline second value for `aria-valuetext`. */
      getAriaValueText: (nextValue: number) => formatTimelineTimeValue(nextValue),
      /** Props for a Base UI `Slider.Root`. */
      rootProps: {
        min: control.min,
        max: control.max,
        step: control.step,
        value: control.value,
        onValueChange: setValue,
        onValueCommitted: (
          values: readonly number[],
          eventDetails?: TimelineControlCommitDetails
        ) => {
          preparedSnapIndexRef.current = null;
          engine.settle();
          onValueCommitted?.(values, eventDetails);
        },
      },
      /** Props for the Base UI thumb controlling the In point. */
      inThumbProps: {
        'aria-label': inLabel ?? 'In point',
        'aria-valuetext': control.inValueText,
      },
      /** Props for the Base UI thumb controlling the Out point. */
      outThumbProps: {
        'aria-label': outLabel ?? 'Out point',
        'aria-valuetext': control.outValueText,
      },
    }),
    [clear, commit, control, engine, inLabel, onValueCommitted, outLabel, setValue]
  );
}
