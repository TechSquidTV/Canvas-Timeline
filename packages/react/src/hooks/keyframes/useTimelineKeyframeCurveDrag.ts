import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  TimelineCubicBezier,
  TimelineKeyframeCurveGeometryOptions,
  TimelineKeyframeCurveHandle,
} from '@techsquidtv/canvas-timeline-core';
import { normalizeTimelineCubicBezier } from '@techsquidtv/canvas-timeline-core';
import { useTimeline } from '../core/useTimeline';
import {
  timelineCommandFail,
  timelineCommandOk,
  type TimelineCommandResult,
} from '../core/timelineCommandResult';

/** Pointer data needed to begin a Bezier curve handle drag. */
export interface TimelineKeyframeCurveDragStartInput {
  /** Clip owning the segment. */
  clipId: string;
  /** Segment whose handle is being dragged. */
  segmentId: string;
  /** Outgoing keyframe whose easing will be edited. */
  keyframeId: string;
  /** Which Bezier handle is being dragged. */
  handle: TimelineKeyframeCurveHandle['handle'];
  /** Optional handle entry from the initiating hit test. */
  curveHandle?: TimelineKeyframeCurveHandle;
}

/** Pointer data needed to update a Bezier curve handle drag. */
export interface TimelineKeyframeCurveDragMoveInput {
  /** Current pointer X in timeline viewport coordinates. */
  viewportX: number;
  /** Current pointer Y in timeline viewport coordinates, including the ruler area. */
  viewportY: number;
}

/** Options accepted by `useTimelineKeyframeCurveDrag`. */
export type UseTimelineKeyframeCurveDragOptions = TimelineKeyframeCurveGeometryOptions;

/** Result returned by `useTimelineKeyframeCurveDrag`. */
export interface UseTimelineKeyframeCurveDragResult {
  /** Whether a Bezier curve handle drag is currently active. */
  dragging: boolean;
  /** Starts a Bezier curve handle drag. */
  startKeyframeCurveDrag: (input: TimelineKeyframeCurveDragStartInput) => TimelineCommandResult;
  /** Updates the active Bezier curve handle drag preview. */
  moveKeyframeCurveDrag: (
    input: TimelineKeyframeCurveDragMoveInput
  ) => TimelineCommandResult<TimelineKeyframeCurveDragUpdate>;
  /** Ends the active Bezier curve handle drag and settles history. */
  endKeyframeCurveDrag: () => TimelineCommandResult;
  /** Cancels pointer handling for the active drag and settles current preview state. */
  cancelKeyframeCurveDrag: () => TimelineCommandResult;
}

/** Successful Bezier curve handle drag update payload. */
export interface TimelineKeyframeCurveDragUpdate {
  /** Clip owning the edited keyframe. */
  clipId: string;
  /** Segment whose handle was dragged. */
  segmentId: string;
  /** Outgoing keyframe whose easing changed. */
  keyframeId: string;
  /** Which Bezier handle was dragged. */
  handle: TimelineKeyframeCurveHandle['handle'];
  /** Updated Bezier easing control points. */
  easing: TimelineCubicBezier;
}

interface ActiveCurveDrag {
  clipId: string;
  segmentId: string;
  keyframeId: string;
  handle: TimelineKeyframeCurveHandle['handle'];
}

function clampRatio(value: number) {
  return Math.max(0, Math.min(1, value));
}

/**
 * Headless Bezier curve handle drag behavior shared by package and custom timeline UIs.
 *
 * @param options - Drag geometry aligned with the renderer and hit-test layer.
 */
export function useTimelineKeyframeCurveDrag(
  options: UseTimelineKeyframeCurveDragOptions = {}
): UseTimelineKeyframeCurveDragResult {
  const { engine } = useTimeline();
  const activeDragRef = useRef<ActiveCurveDrag | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    return () => {
      if (!activeDragRef.current) {
        return;
      }

      activeDragRef.current = null;
      setDragging(false);
      engine.endDrag();
      engine.settle();
    };
  }, [engine]);

  const geometry = useMemo(
    () => ({
      collapsedTrackHeight: options.collapsedTrackHeight,
      curveHandleSize: options.curveHandleSize,
      edgeThreshold: options.edgeThreshold,
      keyframeSize: options.keyframeSize,
      keyframeValuePadding: options.keyframeValuePadding,
      overscanPixels: options.overscanPixels,
      property: options.property,
      rulerHeight: options.rulerHeight,
      selectedClipOnly: options.selectedClipOnly,
      selectedKeyframeOnly: options.selectedKeyframeOnly,
      touchEdgeThreshold: options.touchEdgeThreshold,
      trackHeight: options.trackHeight,
      viewportHeight: options.viewportHeight,
      viewportWidth: options.viewportWidth,
    }),
    [
      options.collapsedTrackHeight,
      options.curveHandleSize,
      options.edgeThreshold,
      options.keyframeSize,
      options.keyframeValuePadding,
      options.overscanPixels,
      options.property,
      options.rulerHeight,
      options.selectedClipOnly,
      options.selectedKeyframeOnly,
      options.touchEdgeThreshold,
      options.trackHeight,
      options.viewportHeight,
      options.viewportWidth,
    ]
  );

  const findCurveHandle = useCallback(
    (input: TimelineKeyframeCurveDragStartInput) =>
      input.curveHandle ??
      engine
        .getKeyframeCurveSegments(geometry)
        .flatMap((segment) => segment.handles)
        .find(
          (handle) =>
            handle.clip.id === input.clipId &&
            handle.segmentId === input.segmentId &&
            handle.keyframe.id === input.keyframeId &&
            handle.handle === input.handle
        ),
    [engine, geometry]
  );

  const startKeyframeCurveDrag = useCallback(
    (input: TimelineKeyframeCurveDragStartInput): TimelineCommandResult => {
      const found = engine.getClip(input.clipId);
      const handle = findCurveHandle(input);

      if (!found || !handle) {
        return timelineCommandFail('not-found');
      }
      if (found.track.locked) {
        return timelineCommandFail('locked');
      }

      engine.startDrag();
      activeDragRef.current = {
        clipId: input.clipId,
        segmentId: input.segmentId,
        keyframeId: input.keyframeId,
        handle: input.handle,
      };
      setDragging(true);

      return timelineCommandOk();
    },
    [engine, findCurveHandle]
  );

  const moveKeyframeCurveDrag = useCallback(
    (
      input: TimelineKeyframeCurveDragMoveInput
    ): TimelineCommandResult<TimelineKeyframeCurveDragUpdate> => {
      const activeDrag = activeDragRef.current;
      if (!activeDrag) {
        return timelineCommandFail<TimelineKeyframeCurveDragUpdate>('unsupported');
      }

      const segment = engine
        .getKeyframeCurveSegments(geometry)
        .find(
          (candidate) =>
            candidate.clip.id === activeDrag.clipId && candidate.segmentId === activeDrag.segmentId
        );
      if (!segment?.easing) {
        return timelineCommandFail<TimelineKeyframeCurveDragUpdate>('not-found');
      }

      const deltaX = segment.endPoint.x - segment.startPoint.x;
      if (Math.abs(deltaX) < 0.000001) {
        return timelineCommandFail<TimelineKeyframeCurveDragUpdate>('unsupported');
      }

      const deltaY = segment.endPoint.y - segment.startPoint.y;
      const easing = normalizeTimelineCubicBezier(segment.easing);
      const nextX = clampRatio((input.viewportX - segment.startPoint.x) / deltaX);
      const yValue =
        Math.abs(deltaY) < 0.000001
          ? activeDrag.handle === 'outgoing'
            ? easing.y1
            : easing.y2
          : clampRatio((input.viewportY - segment.startPoint.y) / deltaY);
      const nextEasing: TimelineCubicBezier =
        activeDrag.handle === 'outgoing'
          ? { ...easing, x1: nextX, y1: yValue }
          : { ...easing, x2: nextX, y2: yValue };

      const keyframe = engine.updateClipKeyframe(
        {
          clipId: activeDrag.clipId,
          keyframeId: activeDrag.keyframeId,
          interpolation: 'bezier',
          easing: nextEasing,
        },
        { commit: false }
      );
      if (!keyframe?.easing) {
        return timelineCommandFail<TimelineKeyframeCurveDragUpdate>('unsupported');
      }

      return timelineCommandOk({
        clipId: activeDrag.clipId,
        segmentId: activeDrag.segmentId,
        keyframeId: activeDrag.keyframeId,
        handle: activeDrag.handle,
        easing: keyframe.easing,
      });
    },
    [engine, geometry]
  );

  const endKeyframeCurveDrag = useCallback((): TimelineCommandResult => {
    if (!activeDragRef.current) {
      return timelineCommandFail('unsupported');
    }

    activeDragRef.current = null;
    setDragging(false);
    engine.endDrag();
    engine.settle();
    return timelineCommandOk();
  }, [engine]);

  const cancelKeyframeCurveDrag = useCallback((): TimelineCommandResult => {
    if (!activeDragRef.current) {
      return timelineCommandFail('unsupported');
    }

    activeDragRef.current = null;
    setDragging(false);
    engine.endDrag();
    engine.settle();
    return timelineCommandOk();
  }, [engine]);

  return useMemo(
    () => ({
      dragging,
      startKeyframeCurveDrag,
      moveKeyframeCurveDrag,
      endKeyframeCurveDrag,
      cancelKeyframeCurveDrag,
    }),
    [
      cancelKeyframeCurveDrag,
      dragging,
      endKeyframeCurveDrag,
      moveKeyframeCurveDrag,
      startKeyframeCurveDrag,
    ]
  );
}
