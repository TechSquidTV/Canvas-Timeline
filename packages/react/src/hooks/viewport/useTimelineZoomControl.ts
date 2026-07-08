import { useCallback, useMemo } from 'react';
import { clamp, round } from '@techsquidtv/canvas-timeline-utils';
import { createTimelineScalarControlProps } from '#react/hooks/core/timelineScalarControlProps';
import { useTimeline } from '#react/hooks/core/useTimeline';
import { useTimelineZoomScale } from '#react/hooks/viewport/useTimelineZoomScale';

/**
 * Options for adapting timeline zoom to a scalar control.
 */
export interface TimelineZoomControlOptions {
  /** Minimum zoom scale in pixels per second. Defaults to 10. */
  min?: number;
  /** Maximum zoom scale in pixels per second. Defaults to 1000. */
  max?: number;
  /** Slider step in pixels per second. Defaults to 10. */
  step?: number;
  /** Accessible label for the zoom control. */
  label?: string;
  /** Called after a Base UI-style value commit has settled the engine. */
  onValueCommitted?: (value: number[], eventDetails?: unknown) => void;
}

function formatZoomValue(value: number) {
  const rounded = round(value, 2);
  return `${rounded} pixels per second`;
}

/**
 * Adapts timeline zoom scale to a Base UI-compatible scalar slider.
 *
 * Use this hook when a product toolbar needs a focused, semantic zoom control
 * rather than broad viewport commands from `useTimelineViewport`. The returned
 * root props mutate `TimelineEngine.zoomScale`; thumb props provide the default
 * label and formatted `aria-valuetext`.
 *
 * @param options - Optional zoom bounds, step size, label, and commit callback.
 * @returns Current zoom scale, formatted value text, imperative setters, and props for `Slider.Root` plus `Slider.Thumb`.
 *
 * @example
 * ```tsx
 * const zoom = useTimelineZoomControl({ min: 25, max: 400, step: 25 });
 *
 * return (
 *   <Slider.Root {...zoom.rootProps}>
 *     <Slider.Control>
 *       <Slider.Track>
 *         <Slider.Indicator />
 *         <Slider.Thumb {...zoom.thumbProps} />
 *       </Slider.Track>
 *     </Slider.Control>
 *   </Slider.Root>
 * );
 * ```
 */
export function useTimelineZoomControl(options: TimelineZoomControlOptions = {}) {
  const { label: optionLabel, max: optionMax, min: optionMin, onValueCommitted, step } = options;
  const { engine } = useTimeline();
  const zoomScale = useTimelineZoomScale();
  const control = useMemo(() => {
    const engineMin = engine.minZoomScale;
    const engineMax = engine.maxZoomScale;
    const min = Math.max(optionMin ?? 10, engineMin);
    const requestedMax = optionMax ?? (Number.isFinite(engineMax) ? engineMax : 1000);
    const max = Math.max(min, Math.min(requestedMax, engineMax));

    return {
      label: optionLabel ?? 'Timeline zoom',
      max,
      min,
      step: step ?? 10,
      value: zoomScale,
      valueText: formatZoomValue(zoomScale),
    };
  }, [
    engine.maxZoomScale,
    engine.minZoomScale,
    optionLabel,
    optionMax,
    optionMin,
    step,
    zoomScale,
  ]);

  const setValue = useCallback(
    (nextValue: number) => {
      engine.setZoomScale(clamp(nextValue, control.min, control.max));
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
      getAriaValueText: formatZoomValue,
      onEmptyCommit: () => engine.settle(),
      onValueCommitted,
    });

    return {
      /** Accessible label used by the default thumb props. */
      label: control.label,
      /** Maximum zoom scale in pixels per second. */
      max: control.max,
      /** Minimum zoom scale in pixels per second. */
      min: control.min,
      /** Slider step in pixels per second. */
      step: control.step,
      /** Current zoom scale in pixels per second. */
      value: control.value,
      /** Formatted zoom value for assistive technology. */
      valueText: control.valueText,
      /** Sets zoom scale without an additional explicit commit callback. */
      setValue,
      /** Sets zoom scale and settles the engine interaction. */
      commit,
      /** Formats a zoom-scale value for `aria-valuetext`. */
      getAriaValueText: scalarProps.getAriaValueText,
      /** Props for a Base UI `Slider.Root`. */
      rootProps: scalarProps.rootProps,
      /** Props for a Base UI `Slider.Thumb`. */
      thumbProps: scalarProps.thumbProps,
    };
  }, [commit, control, engine, onValueCommitted, setValue]);
}
