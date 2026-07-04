import { useMemo } from 'react';
import {
  useTimelineVerticalScrollbar,
  type UseTimelineVerticalScrollbarResult,
} from './useTimelineVerticalScrollbar';

function formatPixels(value: number) {
  return `${Math.round(value)} pixels`;
}

/** State and formatted accessibility props for a vertical timeline scrollbar. */
export interface UseTimelineVerticalRangeControlResult extends UseTimelineVerticalScrollbarResult {
  /** Formatted visible vertical range for assistive technology. */
  valueText: string;
  /** Formatted visible vertical range start. */
  startValueText: string;
  /** Formatted visible vertical range end. */
  endValueText: string;
}

/**
 * Adds formatted accessibility values to the vertical timeline scrollbar adapter.
 *
 * @returns Timeline vertical metrics and `RangeScrollbar.Root` props with formatted value text.
 */
export function useTimelineVerticalRangeControl(): UseTimelineVerticalRangeControlResult {
  const viewport = useTimelineVerticalScrollbar();

  return useMemo(() => {
    const valueText = `${formatPixels(viewport.viewStartPixels)} to ${formatPixels(
      viewport.viewEndPixels
    )}, height ${formatPixels(viewport.viewHeight)}`;

    return {
      ...viewport,
      valueText,
      startValueText: formatPixels(viewport.viewStartPixels),
      endValueText: formatPixels(viewport.viewEndPixels),
      rootProps: {
        ...viewport.rootProps,
        getAriaValueText: (value: number) => formatPixels(value),
      },
    };
  }, [viewport]);
}
