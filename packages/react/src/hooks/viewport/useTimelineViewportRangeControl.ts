import { useMemo } from 'react';
import {
  formatTimelineRangeValue,
  formatTimelineTimeValue,
  type TimelineTimeValueFormatOptions,
} from '#react/accessibility';
import {
  useTimelineViewportScrollbar,
  type UseTimelineViewportScrollbarOptions,
} from '#react/hooks/viewport/useTimelineViewportScrollbar';
import type { RangeScrollbarAriaValueTextDetails } from '#react/rangeScrollbar';

/**
 * Options for viewport scrollbar accessibility formatting.
 */
export interface TimelineViewportRangeControlOptions
  extends UseTimelineViewportScrollbarOptions, TimelineTimeValueFormatOptions {}

/**
 * Adds formatted accessibility values to the timeline viewport range adapter.
 *
 * This hook builds on `useTimelineViewportScrollbar`, preserving the same
 * lightweight viewport scrollbar geometry and keyboard behavior while adding
 * `aria-valuetext` formatting for the thumb and resize handles. Use it with the
 * generic `RangeScrollbar` primitive when composing a custom viewport control.
 *
 * @param options - Viewport scrollbar options plus optional decimal precision for spoken time values.
 * @returns Timeline viewport metrics and `RangeScrollbar.Root` props with formatted value text.
 *
 * @example
 * ```tsx
 * const viewport = useTimelineViewportRangeControl();
 *
 * return (
 *   <RangeScrollbar.Root {...viewport.rootProps}>
 *     <RangeScrollbar.Thumb>
 *       <RangeScrollbar.Handle side="start" />
 *       <RangeScrollbar.Handle side="end" />
 *     </RangeScrollbar.Thumb>
 *   </RangeScrollbar.Root>
 * );
 * ```
 */
export function useTimelineViewportRangeControl(options: TimelineViewportRangeControlOptions = {}) {
  const { minSpan, precision } = options;
  const viewport = useTimelineViewportScrollbar({ minSpan });

  return useMemo(() => {
    const formatOptions = { precision };
    const valueText = formatTimelineRangeValue(viewport.viewStartSeconds, viewport.viewEndSeconds, {
      ...formatOptions,
      includeDuration: true,
    });

    return {
      ...viewport,
      /** Formatted visible viewport range for assistive technology. */
      valueText,
      /** Formatted visible viewport start time. */
      startValueText: formatTimelineTimeValue(viewport.viewStartSeconds, formatOptions),
      /** Formatted visible viewport end time. */
      endValueText: formatTimelineTimeValue(viewport.viewEndSeconds, formatOptions),
      /** Props for `RangeScrollbar.Root`, including formatted `aria-valuetext`. */
      rootProps: {
        ...viewport.rootProps,
        getAriaValueText: (value: number, details: RangeScrollbarAriaValueTextDetails) => {
          if (details.part === 'thumb') {
            return valueText;
          }
          return formatTimelineTimeValue(value, formatOptions);
        },
      },
    };
  }, [precision, viewport]);
}
