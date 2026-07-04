import { useMemo } from 'react';
import type {
  TimelineClipGeometryOptions,
  TimelineClipRect,
} from '@techsquidtv/canvas-timeline-core';
import { useTimeline } from '../core/useTimeline';
import { useTimelineGeometryRevision } from '../core/useTimelineGeometryRevision';

/** Options accepted by `useTimelineClipRects`. */
export type UseTimelineClipRectsOptions = TimelineClipGeometryOptions;

/**
 * Returns viewport-space geometry for every timeline clip.
 *
 * The hook subscribes to geometry-affecting timeline events and intentionally
 * does not subscribe to playhead-only updates.
 *
 * @param options - Optional ruler and track metrics aligned with the renderer.
 * @returns Clip entries with viewport rectangles and edit/display state.
 */
export function useTimelineClipRects<TrackKind = string>(
  options: UseTimelineClipRectsOptions = {}
): TimelineClipRect<TrackKind>[] {
  const { engine } = useTimeline();
  const revision = useTimelineGeometryRevision();
  const { collapsedTrackHeight, edgeThreshold, rulerHeight, touchEdgeThreshold, trackHeight } =
    options;

  return useMemo(() => {
    void revision;
    return engine.getClipRects<TrackKind>({
      collapsedTrackHeight,
      edgeThreshold,
      rulerHeight,
      touchEdgeThreshold,
      trackHeight,
    });
  }, [
    collapsedTrackHeight,
    edgeThreshold,
    engine,
    revision,
    rulerHeight,
    touchEdgeThreshold,
    trackHeight,
  ]);
}
