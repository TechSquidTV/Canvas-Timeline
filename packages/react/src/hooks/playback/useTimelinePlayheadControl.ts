import { useCallback, useMemo } from 'react';
import { clamp, fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { formatTimelineTimeValue } from '../../accessibility';
import { createTimelineScalarControlProps } from '../core/timelineScalarControlProps';
import { useTimeline } from '../core/useTimeline';
import { useTimelinePlayheadTime } from './useTimelinePlayheadTime';

/**
 * Options for adapting the timeline playhead to a scalar control.
 */
export interface TimelinePlayheadControlOptions {
  /** Minimum timeline time in seconds. Defaults to 0. */
  min?: number;
  /** Maximum timeline time in seconds. Defaults to timeline duration/content end. */
  max?: number;
  /** Slider step in seconds for consumers using slider primitives. */
  step?: number;
  /** Accessible label for the playhead control. */
  label?: string;
  /** Called after a Base UI-style value commit has settled the engine. */
  onValueCommitted?: (value: number[], eventDetails?: unknown) => void;
}

/**
 * Adapts the timeline playhead to a Base UI-compatible scalar slider.
 *
 * Use this hook when an application wants its own playhead scrubber, time field,
 * or transport control while preserving the shared `TimelineEngine` state. It
 * composes with `useTimelinePlayback`, which exposes imperative transport
 * commands without subscribing to live playhead ticks.
 *
 * @param options - Optional bounds, step size, label, and commit callback for the playhead control.
 * @returns Current playhead seconds, formatted value text, imperative setters, and props for `Slider.Root` plus `Slider.Thumb`.
 *
 * @example
 * ```tsx
 * const playhead = useTimelinePlayheadControl();
 *
 * return (
 *   <Slider.Root {...playhead.rootProps}>
 *     <Slider.Control>
 *       <Slider.Track>
 *         <Slider.Indicator />
 *         <Slider.Thumb {...playhead.thumbProps} />
 *       </Slider.Track>
 *     </Slider.Control>
 *   </Slider.Root>
 * );
 * ```
 */
export function useTimelinePlayheadControl(options: TimelinePlayheadControlOptions = {}) {
  const { label: optionLabel, max: optionMax, min: optionMin, onValueCommitted, step } = options;
  const { engine, state } = useTimeline();
  const playheadTime = useTimelinePlayheadTime();
  const max = useMemo(() => {
    if (optionMax !== undefined) {
      return optionMax;
    }

    if (state.duration !== undefined) {
      return toSeconds(state.duration);
    }

    return state.tracks.reduce((maxSeconds, track) => {
      const trackMax = (track.clips ?? []).reduce(
        (clipMax, clip) => Math.max(clipMax, toSeconds(clip.timelineEnd)),
        maxSeconds
      );
      return Math.max(maxSeconds, trackMax);
    }, 0);
  }, [optionMax, state.duration, state.tracks]);
  const control = useMemo(() => {
    const value = toSeconds(playheadTime);
    return {
      label: optionLabel ?? 'Playhead',
      max,
      min: optionMin ?? 0,
      step: step ?? 0.01,
      value,
      valueText: formatTimelineTimeValue(value),
    };
  }, [max, optionLabel, optionMin, playheadTime, step]);

  const setValue = useCallback(
    (nextValue: number) => {
      const bounded = clamp(nextValue, control.min, control.max);
      engine.updatePlayhead(fromSeconds(bounded, playheadTime.r));
    },
    [control.max, control.min, engine, playheadTime.r]
  );

  const stepBy = useCallback(
    (deltaSeconds: number) => {
      setValue(control.value + deltaSeconds);
    },
    [control.value, setValue]
  );

  const commit = useCallback(
    (nextValue = control.value) => {
      setValue(nextValue);
      engine.settle();
    },
    [control.value, engine, setValue]
  );

  return useMemo(() => {
    const scalarProps = createTimelineScalarControlProps({
      control,
      setValue,
      commit,
      getAriaValueText: formatTimelineTimeValue,
      onEmptyCommit: () => engine.settle(),
      onValueCommitted,
    });

    return {
      /** Accessible label used by the default thumb props. */
      label: control.label,
      /** Maximum playhead time in seconds. */
      max: control.max,
      /** Minimum playhead time in seconds. */
      min: control.min,
      /** Slider step in seconds. */
      step: control.step,
      /** Current playhead time in seconds. */
      value: control.value,
      /** Formatted playhead value for assistive technology. */
      valueText: control.valueText,
      /** Moves the playhead to an absolute time in seconds without settling history. */
      setValue,
      /** Moves the playhead by a relative number of seconds. */
      stepBy,
      /** Moves the playhead and settles the engine interaction. */
      commit,
      /** Formats a timeline second value for `aria-valuetext`. */
      getAriaValueText: scalarProps.getAriaValueText,
      /** Props for a Base UI `Slider.Root`. */
      rootProps: scalarProps.rootProps,
      /** Props for a Base UI `Slider.Thumb`. */
      thumbProps: scalarProps.thumbProps,
    };
  }, [commit, control, engine, onValueCommitted, setValue, stepBy]);
}
