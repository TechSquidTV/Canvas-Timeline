import { useCallback, useMemo } from 'react';
import type {
  TimelineCubicBezier,
  TimelineKeyframeCurveGeometryOptions,
  TimelineKeyframeCurveHandle,
  TimelineKeyframeCurveHandleHitTestResult,
  TimelineKeyframeCurveHitTestInput,
  TimelineKeyframeCurveSegment,
  TimelineKeyframeMutationOptions,
  VisibleTimelineKeyframeCurveSegment,
} from '@techsquidtv/canvas-timeline-core';
import { useTimeline } from '../core/useTimeline';
import { useTimelineGeometryRevision } from '../core/useTimelineGeometryRevision';
import {
  timelineCommandFail,
  timelineCommandOk,
  type TimelineCommandResult,
} from '../core/timelineCommandResult';

/** Options accepted by `useTimelineKeyframeCurves`. */
export interface UseTimelineKeyframeCurvesOptions extends TimelineKeyframeCurveGeometryOptions {
  /** Optional clip id used to scope curve segment lists and commands. */
  clipId?: string;
}

/** Input for updating one keyframe's Bezier easing. */
export interface TimelineKeyframeCurveEasingUpdateInput {
  /** Clip owning the keyframe. */
  clipId: string;
  /** Outgoing keyframe whose easing should change. */
  keyframeId: string;
  /** New Bezier easing control points. */
  easing: TimelineCubicBezier;
}

/** Result returned by `useTimelineKeyframeCurves`. */
export interface UseTimelineKeyframeCurvesResult<TrackKind = string> {
  /** Keyframe curve segments in track order. */
  curveSegments: TimelineKeyframeCurveSegment<TrackKind>[];
  /** Viewport-intersecting keyframe curve segments in track order. */
  visibleCurveSegments: VisibleTimelineKeyframeCurveSegment<TrackKind>[];
  /** Bezier handles from all `curveSegments`. */
  curveHandles: TimelineKeyframeCurveHandle<TrackKind>[];
  /** Bezier handles from all `visibleCurveSegments`. */
  visibleCurveHandles: TimelineKeyframeCurveHandle<TrackKind>[];
  /** Hit-tests one viewport point against visible Bezier handles. */
  getCurveHandleAtPoint: (
    input: TimelineKeyframeCurveHitTestInput
  ) => TimelineKeyframeCurveHandleHitTestResult<TrackKind> | null;
  /** Updates one keyframe's outgoing Bezier easing. */
  updateCurveEasing: (
    input: TimelineKeyframeCurveEasingUpdateInput,
    options?: TimelineKeyframeMutationOptions
  ) => TimelineCommandResult<TimelineCubicBezier>;
}

/**
 * Reads timeline keyframe curve geometry and exposes Bezier easing commands.
 *
 * @param options - Optional clip/property filters and renderer-aligned geometry settings.
 */
export function useTimelineKeyframeCurves<TrackKind = string>(
  options: UseTimelineKeyframeCurvesOptions = {}
): UseTimelineKeyframeCurvesResult<TrackKind> {
  const { engine } = useTimeline();
  const revision = useTimelineGeometryRevision({ redrawOnPreview: true });
  const {
    clipId,
    collapsedTrackHeight,
    curveHandleSize,
    edgeThreshold,
    keyframeSize,
    keyframeValuePadding,
    overscanPixels,
    property,
    rulerHeight,
    selectedClipOnly,
    selectedKeyframeOnly,
    touchEdgeThreshold,
    trackHeight,
    viewportHeight,
    viewportWidth,
  } = options;

  const geometry = useMemo(
    () => ({
      collapsedTrackHeight,
      curveHandleSize,
      edgeThreshold,
      keyframeSize,
      keyframeValuePadding,
      overscanPixels,
      property,
      rulerHeight,
      selectedClipOnly,
      selectedKeyframeOnly,
      touchEdgeThreshold,
      trackHeight,
      viewportHeight,
      viewportWidth,
    }),
    [
      collapsedTrackHeight,
      curveHandleSize,
      edgeThreshold,
      keyframeSize,
      keyframeValuePadding,
      overscanPixels,
      property,
      rulerHeight,
      selectedClipOnly,
      selectedKeyframeOnly,
      touchEdgeThreshold,
      trackHeight,
      viewportHeight,
      viewportWidth,
    ]
  );

  const curveSegments = useMemo(() => {
    void revision;
    return engine
      .getKeyframeCurveSegments<TrackKind>(geometry)
      .filter((entry) => clipId === undefined || entry.clip.id === clipId);
  }, [clipId, engine, geometry, revision]);

  const visibleCurveSegments = useMemo(() => {
    void revision;
    return engine
      .getVisibleKeyframeCurveSegments<TrackKind>(geometry)
      .filter((entry) => clipId === undefined || entry.clip.id === clipId);
  }, [clipId, engine, geometry, revision]);

  const curveHandles = useMemo(
    () => curveSegments.flatMap((segment) => segment.handles),
    [curveSegments]
  );
  const visibleCurveHandles = useMemo(
    () => visibleCurveSegments.flatMap((segment) => segment.handles),
    [visibleCurveSegments]
  );

  const getCurveHandleAtPoint = useCallback(
    (input: TimelineKeyframeCurveHitTestInput) => {
      const hit = engine.getKeyframeCurveHandleAtPoint<TrackKind>(input);
      return hit && (clipId === undefined || hit.clip.id === clipId) ? hit : null;
    },
    [clipId, engine]
  );

  const updateCurveEasing = useCallback(
    (
      input: TimelineKeyframeCurveEasingUpdateInput,
      mutationOptions?: TimelineKeyframeMutationOptions
    ): TimelineCommandResult<TimelineCubicBezier> => {
      const found = engine.getClip(input.clipId);
      const keyframe = engine.updateClipKeyframe(
        {
          clipId: input.clipId,
          keyframeId: input.keyframeId,
          interpolation: 'bezier',
          easing: input.easing,
        },
        mutationOptions
      );
      if (keyframe?.easing) {
        return timelineCommandOk(keyframe.easing);
      }
      if (!found) {
        return timelineCommandFail('not-found');
      }
      return found.track.locked ? timelineCommandFail('locked') : timelineCommandFail('not-found');
    },
    [engine]
  );

  return useMemo(
    () => ({
      curveSegments,
      visibleCurveSegments,
      curveHandles,
      visibleCurveHandles,
      getCurveHandleAtPoint,
      updateCurveEasing,
    }),
    [
      curveHandles,
      curveSegments,
      getCurveHandleAtPoint,
      updateCurveEasing,
      visibleCurveHandles,
      visibleCurveSegments,
    ]
  );
}
