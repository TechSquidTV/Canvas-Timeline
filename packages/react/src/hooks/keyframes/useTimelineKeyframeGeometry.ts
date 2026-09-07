import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { useTimelineGeometryRevision } from '#react/hooks/core/useTimelineGeometryRevision';
import type {
  TimelineKeyframeGeometryOptions,
  TimelineKeyframeRect,
  VisibleTimelineKeyframe,
} from '@techsquidtv/canvas-timeline-core';
import { useMemo } from 'react';

/** Live geometry for custom DOM or canvas implementations. */
export interface UseTimelineKeyframeGeometryResult {
  /** All matching keyframe rectangles. */
  keyframeRects: TimelineKeyframeRect[];
  /** Matching keyframes intersecting the viewport. */
  visibleKeyframes: VisibleTimelineKeyframe[];
}

/** Reads live geometry separately from settled keyframe commands and inspector state. */
export function useTimelineKeyframeGeometry(
  options: TimelineKeyframeGeometryOptions = {}
): UseTimelineKeyframeGeometryResult {
  const engine = useTimelineEngine();
  const revision = useTimelineGeometryRevision({ redrawOnPreview: true });

  return useMemo(() => {
    void revision;
    const keyframeRects = engine.keyframes.getKeyframeRects(options);
    const visibleKeyframes = engine.keyframes.getVisibleKeyframes(options, keyframeRects);
    return { keyframeRects, visibleKeyframes };
  }, [engine, revision, options]);
}
