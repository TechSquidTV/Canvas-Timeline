import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  TimelineInteractionGeometry,
  TimelineKeyframeRect,
} from '@techsquidtv/canvas-timeline-core';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useTimeline } from '#react/hooks/core/useTimeline';
import {
  timelineCommandFail,
  timelineCommandOk,
  type TimelineCommandResult,
} from '#react/hooks/core/timelineCommandResult';

/** Pointer data needed to begin a keyframe drag. */
export interface TimelineKeyframeDragStartInput {
  /** Clip owning the keyframe. */
  clipId: string;
  /** Keyframe being dragged. */
  keyframeId: string;
  /** Pointer client X captured at drag start. */
  clientX: number;
  /** Pointer Y in timeline viewport coordinates, including the ruler area. */
  viewportY: number;
  /** Optional keyframe rect from the initiating hit test. */
  keyframeRect?: TimelineKeyframeRect;
}

/** Pointer data needed to update a keyframe drag. */
export interface TimelineKeyframeDragMoveInput {
  /** Current pointer client X. */
  clientX: number;
  /** Current pointer Y in timeline viewport coordinates, including the ruler area. */
  viewportY: number;
}

/**
 * Options accepted by `useTimelineKeyframeDrag`.
 *
 * @remarks
 *
 * Geometry must match the renderer or keyframe interaction layer so horizontal
 * pointer movement maps to timeline time and vertical movement maps to property
 * value consistently. The hook edits values in preview mode while dragging and
 * settles history when the drag ends.
 *
 * @see {@link useTimelineKeyframes}
 * @see {@link https://canvastimeline.com/docs/keyframes | Keyframes}
 */
export interface UseTimelineKeyframeDragOptions extends TimelineInteractionGeometry {
  /** Keyframe affordance size in CSS pixels. Defaults to engine geometry. */
  keyframeSize?: number;
  /** Vertical padding used when mapping property values into a clip row. Defaults to engine geometry. */
  keyframeValuePadding?: number;
}

/** Result returned by `useTimelineKeyframeDrag`. */
export interface UseTimelineKeyframeDragResult {
  /** Whether a keyframe drag is currently active. */
  dragging: boolean;
  /** Starts a keyframe drag. */
  startKeyframeDrag: (input: TimelineKeyframeDragStartInput) => TimelineCommandResult;
  /** Updates the active keyframe drag preview. */
  moveKeyframeDrag: (
    input: TimelineKeyframeDragMoveInput
  ) => TimelineCommandResult<TimelineKeyframeDragUpdate>;
  /** Ends the active keyframe drag and settles history. */
  endKeyframeDrag: () => TimelineCommandResult;
  /** Cancels pointer handling for the active drag and settles current preview state. */
  cancelKeyframeDrag: () => TimelineCommandResult;
}

/** Successful keyframe drag update payload. */
export interface TimelineKeyframeDragUpdate {
  /** Clip owning the keyframe. */
  clipId: string;
  /** Keyframe being dragged. */
  keyframeId: string;
  /** Updated timeline time. */
  time: RationalTime;
  /** Updated property value. */
  value: number;
}

interface ActiveKeyframeDrag {
  clipId: string;
  keyframeId: string;
  property: TimelineKeyframeRect['keyframe']['property'];
  startClientX: number;
  startCenterX: number;
}

function clampRatio(value: number) {
  return Math.max(0, Math.min(1, value));
}

/**
 * Headless keyframe drag behavior shared by canvas and custom timeline UIs.
 *
 * @remarks
 *
 * Use this hook when building custom DOM or canvas hit targets for keyframe
 * points. The hook owns drag lifecycle, preview updates, value mapping, and
 * settle behavior. It intentionally does not render handles; pair it with
 * {@link useTimelineKeyframes} for keyframe geometry.
 *
 * @param options - Drag geometry aligned with the renderer and hit-test layer.
 * @returns Keyframe drag state and pointer command helpers.
 *
 * @example
 * ```tsx
 * import { useTimelineKeyframeDrag } from '#react/hooks';
 *
 * export function KeyframeHandle({ clipId, keyframeId }: { clipId: string; keyframeId: string }) {
 *   const drag = useTimelineKeyframeDrag();
 *
 *   return (
 *     <button
 *       type="button"
 *       aria-pressed={drag.dragging}
 *       onPointerDown={(event) =>
 *         drag.startKeyframeDrag({
 *           clipId,
 *           keyframeId,
 *           clientX: event.clientX,
 *           viewportY: event.nativeEvent.offsetY,
 *         })
 *       }
 *     >
 *       Move keyframe
 *     </button>
 *   );
 * }
 * ```
 *
 * @see {@link useTimelineKeyframes}
 * @see {@link https://canvastimeline.com/demos/keyframe-opacity | Keyframe opacity demo}
 */
export function useTimelineKeyframeDrag(
  options: UseTimelineKeyframeDragOptions = {}
): UseTimelineKeyframeDragResult {
  const { engine } = useTimeline();
  const activeDragRef = useRef<ActiveKeyframeDrag | null>(null);
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

  const clipGeometry = useMemo(
    () => ({
      collapsedTrackHeight: options.collapsedTrackHeight,
      edgeThreshold: options.edgeThreshold,
      rulerHeight: options.rulerHeight,
      touchEdgeThreshold: options.touchEdgeThreshold,
      trackHeight: options.trackHeight,
    }),
    [
      options.collapsedTrackHeight,
      options.edgeThreshold,
      options.rulerHeight,
      options.touchEdgeThreshold,
      options.trackHeight,
    ]
  );

  const getValueAtViewportY = useCallback(
    (clipId: string, property: TimelineKeyframeRect['keyframe']['property'], viewportY: number) => {
      const clipRect = engine.getClipRect(clipId, clipGeometry);
      const definition = engine.getKeyframePropertyDefinition(property);
      if (!clipRect) {
        return null;
      }
      if (!definition) {
        return null;
      }

      const valuePadding = Math.max(0, options.keyframeValuePadding ?? 7);
      const usableHeight = Math.max(1, clipRect.height - valuePadding * 2);
      const ratio = clampRatio((viewportY - clipRect.y - valuePadding) / usableHeight);
      return definition.denormalizeValue(1 - ratio);
    },
    [clipGeometry, engine, options.keyframeValuePadding]
  );

  const startKeyframeDrag = useCallback(
    (input: TimelineKeyframeDragStartInput): TimelineCommandResult => {
      const found = engine.getClip(input.clipId);
      const rect =
        input.keyframeRect ??
        engine
          .getKeyframeRects({
            ...clipGeometry,
            keyframeSize: options.keyframeSize,
            keyframeValuePadding: options.keyframeValuePadding,
          })
          .find(
            (entry) => entry.clip.id === input.clipId && entry.keyframe.id === input.keyframeId
          );

      if (!found || !rect) {
        return timelineCommandFail('not-found');
      }
      if (found.track.locked) {
        return timelineCommandFail('locked');
      }

      engine.startDrag();
      activeDragRef.current = {
        clipId: input.clipId,
        keyframeId: input.keyframeId,
        property: rect.keyframe.property,
        startClientX: input.clientX,
        startCenterX: engine.timeToPixel(rect.keyframe.time),
      };
      setDragging(true);

      return timelineCommandOk();
    },
    [clipGeometry, engine, options.keyframeSize, options.keyframeValuePadding]
  );

  const moveKeyframeDrag = useCallback(
    (input: TimelineKeyframeDragMoveInput): TimelineCommandResult<TimelineKeyframeDragUpdate> => {
      const activeDrag = activeDragRef.current;
      if (!activeDrag) {
        return timelineCommandFail<TimelineKeyframeDragUpdate>('unsupported');
      }

      const value = getValueAtViewportY(activeDrag.clipId, activeDrag.property, input.viewportY);
      if (value === null) {
        return timelineCommandFail<TimelineKeyframeDragUpdate>('not-found');
      }

      const deltaX = input.clientX - activeDrag.startClientX;
      const time = engine.pixelToTime(activeDrag.startCenterX + deltaX);
      const keyframe = engine.updateClipKeyframe(
        {
          clipId: activeDrag.clipId,
          keyframeId: activeDrag.keyframeId,
          time,
          value,
        },
        { commit: false }
      );

      if (!keyframe) {
        return timelineCommandFail<TimelineKeyframeDragUpdate>('unsupported');
      }

      return timelineCommandOk({
        clipId: activeDrag.clipId,
        keyframeId: activeDrag.keyframeId,
        time: keyframe.time,
        value: keyframe.value,
      });
    },
    [engine, getValueAtViewportY]
  );

  const endKeyframeDrag = useCallback((): TimelineCommandResult => {
    if (!activeDragRef.current) {
      return timelineCommandFail('unsupported');
    }

    activeDragRef.current = null;
    setDragging(false);
    engine.endDrag();
    engine.settle();
    return timelineCommandOk();
  }, [engine]);

  const cancelKeyframeDrag = useCallback((): TimelineCommandResult => {
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
      startKeyframeDrag,
      moveKeyframeDrag,
      endKeyframeDrag,
      cancelKeyframeDrag,
    }),
    [cancelKeyframeDrag, dragging, endKeyframeDrag, moveKeyframeDrag, startKeyframeDrag]
  );
}
