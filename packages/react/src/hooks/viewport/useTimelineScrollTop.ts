import type { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { useTimelineExternalStore } from '../core/useTimelineExternalStore';

const scrollTopEvents = ['scroll:change', 'render'] as const;
const getTimelineScrollTop = (engine: TimelineEngine) => engine.scrollTop;

/**
 * Hook to subscribe directly to scroll top position changes.
 * Bypasses root-level context state updates for smooth vertical navigation.
 *
 * @returns The current scroll top offset in pixels.
 */
export function useTimelineScrollTop(): number {
  return useTimelineExternalStore(scrollTopEvents, getTimelineScrollTop);
}
