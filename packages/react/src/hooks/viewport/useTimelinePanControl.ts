import { useCallback, useMemo } from 'react';
import { clamp, round } from '@techsquidtv/canvas-timeline-utils';
import { createTimelineScalarControlProps } from '#react/hooks/core/timelineScalarControlProps';
import { useTimeline } from '#react/hooks/core/useTimeline';
import { useTimelineScrollLeft } from '#react/hooks/viewport/useTimelineScrollLeft';

/**
 * Options for adapting horizontal timeline scroll to a scalar control.
 */
export interface TimelinePanControlOptions {
  /** Minimum scroll offset in pixels. Defaults to 0. */
  min?: number;
  /** Maximum scroll offset in pixels. Defaults to the engine max scroll left. */
  max?: number;
  /** Slider step in pixels. Defaults to 1. */
  step?: number;
  /** Accessible label for the pan control. */
  label?: string;
  /** Called after a Base UI-style value commit has settled the engine. */
  onValueCommitted?: (value: number[], eventDetails?: unknown) => void;
}

function formatPanValue(value: number) {
  const rounded = round(value, 2);
  return `${rounded} pixels`;
}

/**
 * Adapts horizontal timeline scroll to a Base UI-compatible scalar slider.
 *
 * Use this hook when an application wants a semantic pan control for
 * `TimelineEngine.scrollLeft`. It overlaps with `useTimelineViewport` only at
 * the engine command layer; this hook adds slider props, bounds, and formatted
 * ARIA value text for custom UI primitives.
 *
 * @param options - Optional scroll bounds, step size, label, and commit callback.
 * @returns Current scroll offset, formatted value text, imperative setters, and props for `Slider.Root` plus `Slider.Thumb`.
 *
 * @example
 * ```tsx
 * const pan = useTimelinePanControl({ step: 40 });
 *
 * return (
 *   <Slider.Root {...pan.rootProps}>
 *     <Slider.Control>
 *       <Slider.Track>
 *         <Slider.Indicator />
 *         <Slider.Thumb {...pan.thumbProps} />
 *       </Slider.Track>
 *     </Slider.Control>
 *   </Slider.Root>
 * );
 * ```
 */
export function useTimelinePanControl(options: TimelinePanControlOptions = {}) {
  const { label: optionLabel, max: optionMax, min: optionMin, onValueCommitted, step } = options;
  const { engine } = useTimeline();
  const scrollLeft = useTimelineScrollLeft();
  const control = useMemo(
    () => ({
      label: optionLabel ?? 'Timeline pan',
      max: optionMax ?? engine.maxScrollLeft,
      min: optionMin ?? 0,
      step: step ?? 1,
      value: scrollLeft,
      valueText: formatPanValue(scrollLeft),
    }),
    [engine.maxScrollLeft, optionLabel, optionMax, optionMin, scrollLeft, step]
  );

  const setValue = useCallback(
    (nextValue: number) => {
      engine.setScrollLeft(clamp(nextValue, control.min, control.max));
    },
    [control.max, control.min, engine]
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
      getAriaValueText: formatPanValue,
      onEmptyCommit: () => engine.settle(),
      onValueCommitted,
    });

    return {
      /** Accessible label used by the default thumb props. */
      label: control.label,
      /** Maximum scroll offset in pixels. */
      max: control.max,
      /** Minimum scroll offset in pixels. */
      min: control.min,
      /** Slider step in pixels. */
      step: control.step,
      /** Current horizontal scroll offset in pixels. */
      value: control.value,
      /** Formatted pan value for assistive technology. */
      valueText: control.valueText,
      /** Sets horizontal scroll offset without an additional explicit commit callback. */
      setValue,
      /** Sets horizontal scroll offset and settles the engine interaction. */
      commit,
      /** Formats a scroll offset value for `aria-valuetext`. */
      getAriaValueText: scalarProps.getAriaValueText,
      /** Props for a Base UI `Slider.Root`. */
      rootProps: scalarProps.rootProps,
      /** Props for a Base UI `Slider.Thumb`. */
      thumbProps: scalarProps.thumbProps,
    };
  }, [commit, control, engine, onValueCommitted, setValue]);
}
