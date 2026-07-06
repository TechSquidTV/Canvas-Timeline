import { useCallback, useMemo } from 'react';
import type {
  TimelineKeyframeMutationOptions,
  TimelineKeyframePropertyId,
  TimelineKeyframeSegment,
  TimelineKeyframeSegmentGeometryOptions,
  TimelineKeyframeSide,
  TimelineKeyframeSideInterpolation,
  TimelineKeyframeTangentHandle,
  TimelineKeyframeTangentHandleHitTestResult,
  TimelineKeyframeTangentHitTestInput,
  TimelineUpdateClipKeyframeSideOptions,
  VisibleTimelineKeyframeSegment,
} from '@techsquidtv/canvas-timeline-core';
import { useTimeline } from '../core/useTimeline';
import { useTimelineGeometryRevision } from '../core/useTimelineGeometryRevision';
import {
  timelineCommandFail,
  timelineCommandInvalidInput,
  timelineCommandOk,
  type TimelineCommandResult,
} from '../core/timelineCommandResult';

/** Options accepted by `useTimelineKeyframeSegments`. */
export interface UseTimelineKeyframeSegmentsOptions extends TimelineKeyframeSegmentGeometryOptions {
  /** Keyframe property used to scope segment lists and commands. */
  property: TimelineKeyframePropertyId;
  /** Optional clip id used to scope segment lists and commands. */
  clipId?: string;
}

/** Input for updating one keyframe tangent side. */
export interface TimelineKeyframeSideUpdateInput extends Omit<
  TimelineUpdateClipKeyframeSideOptions,
  'side'
> {
  /** Side to update. */
  side: TimelineKeyframeSide;
}

/** Result returned by `useTimelineKeyframeSegments`. */
export interface UseTimelineKeyframeSegmentsResult<TrackKind = string> {
  /** Keyframe segments in track order. */
  segments: TimelineKeyframeSegment<TrackKind>[];
  /** Viewport-intersecting keyframe segments in track order. */
  visibleSegments: VisibleTimelineKeyframeSegment<TrackKind>[];
  /** Bezier tangent handles from all `segments`. */
  tangentHandles: TimelineKeyframeTangentHandle<TrackKind>[];
  /** Bezier tangent handles from all `visibleSegments`. */
  visibleTangentHandles: TimelineKeyframeTangentHandle<TrackKind>[];
  /** Hit-tests one viewport point against visible Bezier tangent handles. */
  getTangentHandleAtPoint: (
    input: TimelineKeyframeTangentHitTestInput
  ) => TimelineKeyframeTangentHandleHitTestResult<TrackKind> | null;
  /** Updates one keyframe side interpolation. */
  updateKeyframeSide: (
    input: TimelineKeyframeSideUpdateInput,
    options?: TimelineKeyframeMutationOptions
  ) => TimelineCommandResult<TimelineKeyframeSideInterpolation>;
}

/**
 * Reads timeline keyframe segment geometry and exposes side-aware tangent commands.
 *
 * @param options - Clip/property filters and renderer-aligned geometry settings.
 */
export function useTimelineKeyframeSegments<TrackKind = string>(
  options: UseTimelineKeyframeSegmentsOptions
): UseTimelineKeyframeSegmentsResult<TrackKind> {
  const { engine } = useTimeline();
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
    selectedKeyframeOnly,
    tangentHandleSize,
    touchEdgeThreshold,
    trackHeight,
    viewportHeight,
    viewportWidth,
  } = options;

  const geometry = useMemo(
    () => ({
      collapsedTrackHeight,
      edgeThreshold,
      keyframeSize,
      keyframeValuePadding,
      overscanPixels,
      property,
      rulerHeight,
      selectedClipOnly,
      selectedKeyframeOnly,
      tangentHandleSize,
      touchEdgeThreshold,
      trackHeight,
      viewportHeight,
      viewportWidth,
    }),
    [
      collapsedTrackHeight,
      edgeThreshold,
      keyframeSize,
      keyframeValuePadding,
      overscanPixels,
      property,
      rulerHeight,
      selectedClipOnly,
      selectedKeyframeOnly,
      tangentHandleSize,
      touchEdgeThreshold,
      trackHeight,
      viewportHeight,
      viewportWidth,
    ]
  );

  const segments = useMemo(() => {
    void revision;
    return engine
      .getKeyframeSegments<TrackKind>(geometry)
      .filter((entry) => clipId === undefined || entry.clip.id === clipId);
  }, [clipId, engine, geometry, revision]);

  const visibleSegments = useMemo(() => {
    void revision;
    return engine
      .getVisibleKeyframeSegments<TrackKind>(geometry)
      .filter((entry) => clipId === undefined || entry.clip.id === clipId);
  }, [clipId, engine, geometry, revision]);

  const tangentHandles = useMemo(() => segments.flatMap((segment) => segment.handles), [segments]);
  const visibleTangentHandles = useMemo(
    () => visibleSegments.flatMap((segment) => segment.handles),
    [visibleSegments]
  );

  const getTangentHandleAtPoint = useCallback(
    (input: TimelineKeyframeTangentHitTestInput) => {
      const hit = engine.getKeyframeTangentHandleAtPoint<TrackKind>(input);
      return hit && (clipId === undefined || hit.clip.id === clipId) ? hit : null;
    },
    [clipId, engine]
  );

  const updateKeyframeSide = useCallback(
    (
      input: TimelineKeyframeSideUpdateInput,
      mutationOptions?: TimelineKeyframeMutationOptions
    ): TimelineCommandResult<TimelineKeyframeSideInterpolation> => {
      const found = engine.getClip(input.clipId);
      let keyframe: ReturnType<typeof engine.updateClipKeyframeSide>;
      try {
        keyframe = engine.updateClipKeyframeSide(input, mutationOptions);
      } catch (updateError: unknown) {
        return timelineCommandInvalidInput(
          'Timeline keyframe side could not be updated from the provided input.',
          updateError
        );
      }
      const side = keyframe?.[input.side];
      if (side) {
        return timelineCommandOk(side);
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
      segments,
      visibleSegments,
      tangentHandles,
      visibleTangentHandles,
      getTangentHandleAtPoint,
      updateKeyframeSide,
    }),
    [
      getTangentHandleAtPoint,
      segments,
      tangentHandles,
      updateKeyframeSide,
      visibleSegments,
      visibleTangentHandles,
    ]
  );
}
