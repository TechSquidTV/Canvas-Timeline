import type { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { useTimelineExternalStore } from '#react/hooks/core/useTimelineExternalStore';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';

const playheadTimeEvents = ['playhead:scrub', 'render'] as const;
const getTimelinePlayheadTime = (engine: TimelineEngine) => engine.playheadTime;

/**
 * Hook to subscribe directly to playhead scrubbing changes.
 * Bypasses root-level context state updates to keep scrubbing high-performance.
 *
 * @returns The current RationalTime of the playhead.
 */
export function useTimelinePlayheadTime(): RationalTime {
  return useTimelineExternalStore(playheadTimeEvents, getTimelinePlayheadTime);
}
