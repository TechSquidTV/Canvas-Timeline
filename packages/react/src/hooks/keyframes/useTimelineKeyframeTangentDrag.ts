import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  TimelineKeyframeBezierHandle,
  TimelineKeyframePropertyId,
  TimelineKeyframeSegmentGeometryOptions,
  TimelineKeyframeSide,
  TimelineKeyframeTangentHandle,
} from '@techsquidtv/canvas-timeline-core';
import { useTimeline } from '#react/hooks/core/useTimeline';
import {
  timelineCommandFail,
  timelineCommandInvalidInput,
  timelineCommandOk,
  type TimelineCommandResult,
} from '#react/hooks/core/timelineCommandResult';

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
  /** Cancels pointer handling for the active drag and settles current preview state. */
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
  const { engine } = useTimeline();
  const activeDragRef = useRef<ActiveTangentDrag | null>(null);
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

      return engine
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
      const handle = findTangentHandle(input);
      const found = handle === undefined ? undefined : engine.getClip(handle.clip.id);

      if (!found || !handle) {
        return timelineCommandFail('not-found');
      }
      if (found.track.locked) {
        return timelineCommandFail('locked');
      }

      engine.startDrag();
      activeDragRef.current = {
        clipId: handle.clip.id,
        segmentId: handle.segmentId,
        keyframeId: handle.keyframe.id,
        side: handle.side,
      };
      setDragging(true);

      return timelineCommandOk();
    },
    [engine, findTangentHandle]
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

      const segment = engine
        .getKeyframeSegments(geometry)
        .find(
          (candidate) =>
            candidate.clip.id === activeDrag.clipId && candidate.segmentId === activeDrag.segmentId
        );
      if (!segment) {
        return timelineCommandFail<TimelineKeyframeTangentDragUpdate>('not-found');
      }

      const deltaX = segment.endPoint.x - segment.startPoint.x;
      if (Math.abs(deltaX) < 0.000001) {
        return timelineCommandFail<TimelineKeyframeTangentDragUpdate>('unsupported');
      }

      const deltaY = segment.endPoint.y - segment.startPoint.y;
      const nextX = clampRatio((input.viewportX - segment.startPoint.x) / deltaX);
      const current =
        activeDrag.side === 'outgoing' ? segment.outgoing.handle : segment.incoming.handle;
      const yValue =
        Math.abs(deltaY) < 0.000001
          ? (current?.y ?? (activeDrag.side === 'outgoing' ? 0 : 1))
          : clampRatio((input.viewportY - segment.startPoint.y) / deltaY);
      const nextHandle = { x: nextX, y: yValue };

      let keyframe: ReturnType<typeof engine.updateClipKeyframeSide>;
      try {
        keyframe = engine.updateClipKeyframeSide(
          {
            clipId: activeDrag.clipId,
            keyframeId: activeDrag.keyframeId,
            side: activeDrag.side,
            patch: {
              interpolation: 'bezier',
              handle: nextHandle,
            },
          },
          { commit: false }
        );
      } catch (updateError: unknown) {
        return timelineCommandInvalidInput(
          'Timeline keyframe tangent could not be updated from the provided input.',
          updateError
        );
      }
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
    [engine, geometry]
  );

  const endKeyframeTangentDrag = useCallback((): TimelineCommandResult => {
    if (!activeDragRef.current) {
      return timelineCommandFail('unsupported');
    }

    activeDragRef.current = null;
    setDragging(false);
    engine.endDrag();
    engine.settle();
    return timelineCommandOk();
  }, [engine]);

  const cancelKeyframeTangentDrag = useCallback((): TimelineCommandResult => {
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
