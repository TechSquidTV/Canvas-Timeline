import { TimelineEditGesture } from '#react/hooks/editing/timelineEditGesture';
import { timelineCommandFail, timelineCommandOk } from '@techsquidtv/canvas-timeline-core';
import type {
  TimelineCommandResult,
  TimelineKeyframeBezierHandle,
  TimelineKeyframePropertyId,
  TimelineKeyframeSegmentGeometryOptions,
  TimelineKeyframeSide,
  TimelineKeyframeTangentHandle,
  TimelineKeyframeSegment,
} from '@techsquidtv/canvas-timeline-core';
import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
/** Pointer data needed to begin a Bezier tangent handle drag by ids. */
export interface TimelineKeyframeTangentDragIdStartInput {
  /** Clip owning the segment. */
  clipId: string;
  /** Segment whose tangent is being dragged. */
  segmentId: string;
  /** Anchor keyframe whose side will be edited. */
  keyframeId: string;
  /** Keyframe side being edited. */
  side: TimelineKeyframeSide;
  /** Supplied handles use `TimelineKeyframeTangentDragHandleStartInput` instead. */
  tangentHandle?: never;
}

/** Pointer data needed to begin a Bezier tangent handle drag from hit-test geometry. */
export interface TimelineKeyframeTangentDragHandleStartInput {
  /** Tangent entry from the initiating hit test. */
  tangentHandle: TimelineKeyframeTangentHandle;
  /** Initial pointer position, used to preserve the padded grab offset. */
  viewportX?: number;
  /** Initial pointer position, used to preserve the padded grab offset. */
  viewportY?: number;
}

/** Pointer data needed to begin a Bezier tangent handle drag. */
export type TimelineKeyframeTangentDragStartInput =
  | TimelineKeyframeTangentDragIdStartInput
  | TimelineKeyframeTangentDragHandleStartInput;

/** Pointer data needed to update a Bezier tangent handle drag. */
export interface TimelineKeyframeTangentDragMoveInput {
  /** Current pointer X in timeline viewport coordinates. */
  viewportX: number;
  /** Current pointer Y in timeline viewport coordinates, including the ruler area. */
  viewportY: number;
}

/** Options accepted by `useTimelineKeyframeTangentDrag`. */
export interface UseTimelineKeyframeTangentDragOptions extends TimelineKeyframeSegmentGeometryOptions {
  /** Keyframe property used to scope tangent drag geometry. */
  property: TimelineKeyframePropertyId;
}

/** Result returned by `useTimelineKeyframeTangentDrag`. */
export interface UseTimelineKeyframeTangentDragResult {
  /** Whether a Bezier tangent handle drag is currently active. */
  dragging: boolean;
  /** Starts a Bezier tangent handle drag. */
  startKeyframeTangentDrag: (input: TimelineKeyframeTangentDragStartInput) => TimelineCommandResult;
  /** Updates the active Bezier tangent handle drag preview. */
  moveKeyframeTangentDrag: (
    input: TimelineKeyframeTangentDragMoveInput
  ) => TimelineCommandResult<TimelineKeyframeTangentDragUpdate>;
  /** Ends the active Bezier tangent handle drag and settles history. */
  endKeyframeTangentDrag: () => TimelineCommandResult;
  /** Cancels the drag and restores committed state without an undo entry. */
  cancelKeyframeTangentDrag: () => TimelineCommandResult;
}

/** Successful Bezier tangent handle drag update payload. */
export interface TimelineKeyframeTangentDragUpdate {
  /** Clip owning the edited keyframe. */
  clipId: string;
  /** Segment whose tangent was dragged. */
  segmentId: string;
  /** Anchor keyframe whose side changed. */
  keyframeId: string;
  /** Keyframe side that changed. */
  side: TimelineKeyframeSide;
  /** Updated Bezier tangent handle. */
  handle: TimelineKeyframeBezierHandle;
}

interface ActiveTangentDrag {
  gesture: TimelineEditGesture;
  segment: TimelineKeyframeSegment;
  valueTop: number;
  valueHeight: number;
  offsetX: number;
  offsetY: number;
  clipId: string;
  segmentId: string;
  keyframeId: string;
  side: TimelineKeyframeSide;
}

function clampRatio(value: number) {
  return Math.max(0, Math.min(1, value));
}

function isFiniteViewportPoint(input: TimelineKeyframeTangentDragMoveInput) {
  return Number.isFinite(input.viewportX) && Number.isFinite(input.viewportY);
}

/**
 * Headless Bezier tangent drag behavior shared by package and custom timeline UIs.
 *
 * @param options - Drag geometry aligned with the renderer and hit-test layer.
 */
export function useTimelineKeyframeTangentDrag(
  options: UseTimelineKeyframeTangentDragOptions
): UseTimelineKeyframeTangentDragResult {
  const engine = useTimelineEngine();
  const activeDragRef = useRef<ActiveTangentDrag | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    return () => {
      if (!activeDragRef.current) {
        return;
      }

      activeDragRef.current.gesture.cancel();
      activeDragRef.current = null;
      setDragging(false);
    };
  }, [engine]);

  const geometry = useMemo(
    () => ({
      collapsedTrackHeight: options.collapsedTrackHeight,
      edgeThreshold: options.edgeThreshold,
      keyframeSize: options.keyframeSize,
      keyframeValuePadding: options.keyframeValuePadding,
      overscanPixels: options.overscanPixels,
      property: options.property,
      rulerHeight: options.rulerHeight,
      selectedClipOnly: options.selectedClipOnly,
      selectedKeyframeOnly: options.selectedKeyframeOnly,
      tangentHandleSize: options.tangentHandleSize,
      touchEdgeThreshold: options.touchEdgeThreshold,
      trackHeight: options.trackHeight,
      viewportHeight: options.viewportHeight,
      viewportWidth: options.viewportWidth,
    }),
    [
      options.collapsedTrackHeight,
      options.edgeThreshold,
      options.keyframeSize,
      options.keyframeValuePadding,
      options.overscanPixels,
      options.property,
      options.rulerHeight,
      options.selectedClipOnly,
      options.selectedKeyframeOnly,
      options.tangentHandleSize,
      options.touchEdgeThreshold,
      options.trackHeight,
      options.viewportHeight,
      options.viewportWidth,
    ]
  );

  const findTangentHandle = useCallback(
    (input: TimelineKeyframeTangentDragStartInput) => {
      if (input.tangentHandle !== undefined) {
        return input.tangentHandle;
      }

      return engine.keyframes
        .getKeyframeSegments(geometry)
        .flatMap((segment) => segment.handles)
        .find(
          (handle) =>
            handle.clip.id === input.clipId &&
            handle.segmentId === input.segmentId &&
            handle.keyframe.id === input.keyframeId &&
            handle.side === input.side
        );
    },
    [engine, geometry]
  );

  const startKeyframeTangentDrag = useCallback(
    (input: TimelineKeyframeTangentDragStartInput): TimelineCommandResult => {
      if (activeDragRef.current) {
        return timelineCommandFail('unsupported', 'A tangent drag is already active.');
      }
      if (
        input.tangentHandle !== undefined &&
        ((input.viewportX !== undefined && !Number.isFinite(input.viewportX)) ||
          (input.viewportY !== undefined && !Number.isFinite(input.viewportY)))
      ) {
        return timelineCommandFail(
          'invalid-input',
          'Tangent drag requires finite viewport coordinates.'
        );
      }
      const handle = findTangentHandle(input);
      const found = handle === undefined ? undefined : engine.geometry.getClip(handle.clip.id);

      if (!found || !handle) {
        return timelineCommandFail('not-found');
      }
      if (found.track.locked) {
        return timelineCommandFail('locked');
      }

      const segment = engine.keyframes
        .getKeyframeSegments(geometry)
        .find(
          (candidate) =>
            candidate.clip.id === handle.clip.id && candidate.segmentId === handle.segmentId
        );
      const clipRect = engine.geometry.getClipRect(handle.clip.id, geometry);
      if (!segment || !clipRect) {
        return timelineCommandFail('not-found');
      }
      engine.cancelEdit();
      activeDragRef.current = {
        gesture: new TimelineEditGesture(engine),
        segment,
        valueTop: clipRect.y + (options.keyframeValuePadding ?? 7),
        valueHeight: Math.max(1, clipRect.height - 2 * (options.keyframeValuePadding ?? 7)),
        offsetX:
          input.tangentHandle !== undefined && input.viewportX !== undefined
            ? input.viewportX - handle.point.x
            : 0,
        offsetY:
          input.tangentHandle !== undefined && input.viewportY !== undefined
            ? input.viewportY - handle.point.y
            : 0,
        clipId: handle.clip.id,
        segmentId: handle.segmentId,
        keyframeId: handle.keyframe.id,
        side: handle.side,
      };
      setDragging(true);

      return timelineCommandOk();
    },
    [engine, findTangentHandle, geometry, options.keyframeValuePadding]
  );

  const moveKeyframeTangentDrag = useCallback(
    (
      input: TimelineKeyframeTangentDragMoveInput
    ): TimelineCommandResult<TimelineKeyframeTangentDragUpdate> => {
      const activeDrag = activeDragRef.current;
      if (!activeDrag) {
        return timelineCommandFail<TimelineKeyframeTangentDragUpdate>('unsupported');
      }
      if (!isFiniteViewportPoint(input)) {
        return timelineCommandFail<TimelineKeyframeTangentDragUpdate>(
          'invalid-input',
          'Timeline keyframe tangent drag requires finite viewport coordinates.'
        );
      }

      if (!activeDrag.gesture.isCurrent()) {
        return timelineCommandFail('unsupported', 'The tangent preview was replaced.');
      }
      const segment = activeDrag.segment;
      const deltaX = segment.endPoint.x - segment.startPoint.x;
      if (Math.abs(deltaX) < 0.000001) {
        return timelineCommandFail('unsupported');
      }
      const nextX = clampRatio(
        (input.viewportX - activeDrag.offsetX - segment.startPoint.x) / deltaX
      );
      const yValue = clampRatio(
        1 - (input.viewportY - activeDrag.offsetY - activeDrag.valueTop) / activeDrag.valueHeight
      );
      const nextHandle = { x: nextX, y: yValue };

      const preview = activeDrag.gesture.publish({
        type: 'keyframes',
        edits: [
          {
            type: 'sides',
            clipId: activeDrag.clipId,
            keyframeId: activeDrag.keyframeId,
            [activeDrag.side]: { interpolation: 'bezier', handle: nextHandle },
          },
        ],
      });
      if (!preview.valid) {
        return timelineCommandFail(preview.reason ?? 'unsupported', preview.message);
      }
      const keyframe = preview.changedClips
        .find((clip) => clip.id === activeDrag.clipId)
        ?.keyframes?.find((key) => key.id === activeDrag.keyframeId);
      const side = keyframe?.[activeDrag.side];
      if (!side?.handle) {
        return timelineCommandFail<TimelineKeyframeTangentDragUpdate>('unsupported');
      }

      return timelineCommandOk({
        clipId: activeDrag.clipId,
        segmentId: activeDrag.segmentId,
        keyframeId: activeDrag.keyframeId,
        side: activeDrag.side,
        handle: side.handle,
      });
    },
    []
  );

  const finish = useCallback((commit: boolean): TimelineCommandResult => {
    const active = activeDragRef.current;
    if (!active) {
      return timelineCommandFail('unsupported');
    }
    activeDragRef.current = null;
    setDragging(false);
    if (commit) {
      return active.gesture.commit();
    }
    active.gesture.cancel();
    return timelineCommandOk();
  }, []);
  const endKeyframeTangentDrag = useCallback(() => finish(true), [finish]);
  const cancelKeyframeTangentDrag = useCallback(() => finish(false), [finish]);

  return useMemo(
    () => ({
      dragging,
      startKeyframeTangentDrag,
      moveKeyframeTangentDrag,
      endKeyframeTangentDrag,
      cancelKeyframeTangentDrag,
    }),
    [
      cancelKeyframeTangentDrag,
      dragging,
      endKeyframeTangentDrag,
      moveKeyframeTangentDrag,
      startKeyframeTangentDrag,
    ]
  );
}
