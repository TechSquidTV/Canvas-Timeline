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
  const {
    clipId,
    collapsedTrackHeight,
    edgeThreshold,
    keyframeSize,
    keyframeValuePadding,
    overscanPixels,
    property,
    rulerHeight,
    selectedClipOnly,
    touchEdgeThreshold,
    trackHeight,
    viewportHeight,
    viewportWidth,
  } = options;

  return useMemo(() => {
    void revision;
    const geometry = {
      clipId,
      collapsedTrackHeight,
      edgeThreshold,
      keyframeSize,
      keyframeValuePadding,
      overscanPixels,
      property,
      rulerHeight,
      selectedClipOnly,
      touchEdgeThreshold,
      trackHeight,
      viewportHeight,
      viewportWidth,
    };
    const keyframeRects = engine.keyframes.getKeyframeRects(geometry);
    const visibleKeyframes = engine.keyframes.getVisibleKeyframes(geometry, keyframeRects);
    return { keyframeRects, visibleKeyframes };
  }, [
    engine,
    revision,
    clipId,
    collapsedTrackHeight,
    edgeThreshold,
    keyframeSize,
    keyframeValuePadding,
    overscanPixels,
    property,
    rulerHeight,
    selectedClipOnly,
    touchEdgeThreshold,
    trackHeight,
    viewportHeight,
    viewportWidth,
  ]);
}
