import { useMemo } from 'react';
import type {
  VisibleTimelineClip,
  VisibleTimelineClipOptions,
} from '@techsquidtv/canvas-timeline-core';
import { useTimeline } from '../core/useTimeline';
import { useTimelineGeometryRevision } from '../core/useTimelineGeometryRevision';

/** Options accepted by `useTimelineVisibleClips`. */
export type UseTimelineVisibleClipsOptions = VisibleTimelineClipOptions;

/**
 * Returns viewport-intersecting timeline clips with clipped time/source ranges.
 *
 * This is the preferred hook for custom DOM clip renderers and custom canvas
 * layers that only need visible or near-visible clips.
 *
 * @param options - Viewport, overscan, and optional renderer-aligned geometry settings.
 * @returns Visible clip entries in track order.
 */
export function useTimelineVisibleClips<TrackKind = string>(
  options: UseTimelineVisibleClipsOptions = {}
): VisibleTimelineClip<TrackKind>[] {
  const { engine } = useTimeline();
  const revision = useTimelineGeometryRevision();
  const {
    collapsedTrackHeight,
    edgeThreshold,
    overscanPixels,
    rulerHeight,
    touchEdgeThreshold,
    trackHeight,
    viewportHeight,
    viewportWidth,
  } = options;

  return useMemo(() => {
    void revision;
    return engine.getVisibleTimelineClips<TrackKind>({
      collapsedTrackHeight,
      edgeThreshold,
      overscanPixels,
      rulerHeight,
      touchEdgeThreshold,
      trackHeight,
      viewportHeight,
      viewportWidth,
    });
  }, [
    collapsedTrackHeight,
    edgeThreshold,
    engine,
    overscanPixels,
    revision,
    rulerHeight,
    touchEdgeThreshold,
    trackHeight,
    viewportHeight,
    viewportWidth,
  ]);
}
