import type { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { useTimelineExternalStore } from '../core/useTimelineExternalStore';

const scrollLeftEvents = ['scroll:change', 'render'] as const;
const getTimelineScrollLeft = (engine: TimelineEngine) => engine.scrollLeft;

/**
 * Hook to subscribe directly to scroll left position changes.
 * Bypasses root-level context state updates for smooth scroll navigation.
 *
 * @returns The current scroll left offset in pixels.
 */
export function useTimelineScrollLeft(): number {
  return useTimelineExternalStore(scrollLeftEvents, getTimelineScrollLeft);
}
