import { timelineCommandFail, timelineCommandOk } from '@techsquidtv/canvas-timeline-core';
import type {
  TimelineCommandResult,
  ClipViewportRect,
  TimelineClipDropFeedback,
  TimelineClipMoveResult,
  TimelineInteractionGeometry,
  TimelineTrackHitTestResult,
  TimelineReadonly,
} from '@techsquidtv/canvas-timeline-core';
import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { TimelineEditGesture } from '#react/hooks/editing/timelineEditGesture';
import { useTimelineTrackDropTargets } from '#react/hooks/tracks/useTimelineTrackDropTargets';
import type {
  TimelineTrackDropGuard,
  TimelineTrackDropResult,
} from '#react/hooks/tracks/useTimelineTrackDropTargets';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
/** Pointer data needed to begin a clip body drag. */
export interface TimelineClipDragStartInput {
  /** Clip being dragged. */
  clipId: string;
  /** Pointer client X captured at drag start. */
  clientX: number;
  /** Pointer Y in timeline viewport coordinates, including the ruler area. */
  viewportY: number;
  /** Optional clip rect from the initiating hit test. */
  clipRect?: ClipViewportRect;
}

/** Pointer data needed to update a clip body drag. */
export interface TimelineClipDragMoveInput {
  /** Current pointer client X. */
  clientX: number;
  /** Current pointer Y in timeline viewport coordinates, including the ruler area. */
  viewportY: number;
}

/**
 * Options accepted by `useTimelineClipDrag`.
 *
 * @remarks
 *
 * Pass renderer-aligned geometry so pointer Y coordinates resolve to the same
 * track rows users see on screen. `canDropClipOnTrack` lets applications enforce
 * domain rules such as preventing audio clips from moving to visual tracks
 * unless a modifier key or tool mode allows it.
 *
 *
 * @see {@link useTimelineTrackDropTargets}
 * @see {@link https://canvastimeline.com/docs/tracks-and-clips | Tracks and clips}
 */
export interface UseTimelineClipDragOptions extends TimelineInteractionGeometry {
  /** Portion of another track the pointer must enter before snapping vertically. Defaults to 0.3. */
  verticalSnapThreshold?: number;
  /** Minimum vertical pixels required before snapping vertically. Defaults to 8. */
  minVerticalSnapPixels?: number;
  /** Optional viewport width used for track row geometry. */
  viewportWidth?: number;
  /** Optional app policy for accepting, rejecting, or expanding drop targets. */
  canDropClipOnTrack?: TimelineTrackDropGuard;
}

/** Result returned by `useTimelineClipDrag`. */
export interface UseTimelineClipDragResult {
  /** Whether a clip body drag is currently active. */
  dragging: boolean;
  /** Current transient drop feedback snapshot. Use `useTimelineClipDropFeedback` for live updates. */
  dropFeedback: TimelineClipDropFeedback;
  /** Starts a clip body drag. */
  startClipDrag: (input: TimelineClipDragStartInput) => TimelineCommandResult;
  /** Updates the active clip body drag preview. */
  moveClipDrag: (input: TimelineClipDragMoveInput) => TimelineCommandResult<TimelineClipMoveResult>;
  /** Ends the active clip body drag and settles history. */
  endClipDrag: () => TimelineCommandResult;
  /** Cancels the active drag and discards its preview. */
  cancelClipDrag: () => TimelineCommandResult;
}

interface ActiveClipDrag {
  gesture: TimelineEditGesture;
  clipId: string;
  startClientX: number;
  startLeft: number;
  sourceTrackId: string;
  sourceTrackIndex: number;
  sourceClipIndex: number;
  previousStartTime: TimelineClipMoveResult['previousStartTime'];
  previousEndTime: TimelineClipMoveResult['previousEndTime'];
  activeTargetTrackId: string;
  activeTargetTrackIndex: number;
  allowCrossKindTrackMove: boolean;
  trackTargets: TimelineReadonly<TimelineTrackHitTestResult>[];
}

function clampRatio(value: number) {
  return Math.max(0, Math.min(1, value));
}

function findTrackTargetAtY(
  trackTargets: TimelineReadonly<TimelineTrackHitTestResult>[],
  viewportY: number
) {
  return (
    trackTargets.find(({ rect }) => viewportY >= rect.y && viewportY < rect.y + rect.height) ?? null
  );
}

function getTrackPenetration(
  target: TimelineReadonly<TimelineTrackHitTestResult>,
  activeTargetTrackIndex: number,
  viewportY: number
) {
  if (target.trackIndex === activeTargetTrackIndex) {
    return {
      ratio: 1,
      pixels: target.rect.height,
    };
  }

  const pixels =
    target.trackIndex > activeTargetTrackIndex
      ? viewportY - target.rect.y
      : target.rect.y + target.rect.height - viewportY;

  return {
    ratio: clampRatio(pixels / Math.max(1, target.rect.height)),
    pixels: Math.max(0, pixels),
  };
}

/**
 * Headless clip body drag behavior shared by canvas and custom timeline UIs.
 *
 * @remarks
 *
 * Use this when building a custom interaction layer around canvas-painted clips.
 * The hook handles drag lifecycle, snapping preparation, cross-track drop
 * policy, transient drop feedback, and commit/settle behavior. Package
 * consumers using the standard DOM chrome can render `Timeline.ClipInteractionLayer`
 * instead.
 *
 * @param options - Drag geometry, vertical snap sensitivity, and optional drop policy.
 * @returns Clip drag state and commands for pointer-driven body moves.
 *
 * @example
 * ```tsx
 * import { useTimelineClipDrag } from '@techsquidtv/canvas-timeline-react';
 *
 * export function CustomClipDragHandle({ clipId }: { clipId: string }) {
 *   const drag = useTimelineClipDrag();
 *
 *   return (
 *     <button
 *       type="button"
 *       aria-pressed={drag.dragging}
 *       onPointerDown={(event) => {
 *         drag.startClipDrag({
 *           clipId,
 *           clientX: event.clientX,
 *           viewportY: event.nativeEvent.offsetY,
 *         });
 *       }}
 *     >
 *       Move clip
 *     </button>
 *   );
 * }
 * ```
 *
 * @see {@link useTimelineClipDropFeedback}
 * @see {@link useTimelineTrackDropTargets}
 * @see {@link https://canvastimeline.com/demos/basic-editor-surface | Basic editor surface demo}
 */
export function useTimelineClipDrag(
  options: UseTimelineClipDragOptions = {}
): UseTimelineClipDragResult {
  const engine = useTimelineEngine();
  const activeDragRef = useRef<ActiveClipDrag | null>(null);
  const [dragging, setDragging] = useState(false);
  const dropTargets = useTimelineTrackDropTargets({
    canDropClipOnTrack: options.canDropClipOnTrack,
    collapsedTrackHeight: options.collapsedTrackHeight,
    edgeThreshold: options.edgeThreshold,
    rulerHeight: options.rulerHeight,
    touchEdgeThreshold: options.touchEdgeThreshold,
    trackHeight: options.trackHeight,
    viewportWidth: options.viewportWidth,
  });

  useEffect(() => {
    return () => {
      const active = activeDragRef.current;
      if (!active) {
        return;
      }

      activeDragRef.current = null;
      setDragging(false);
      if (active.gesture.cancel()) {
        engine.clearClipDropFeedback();
      }
    };
  }, [engine]);

  const publishFeedback = useCallback(
    (
      activeDrag: ActiveClipDrag,
      hoveredTrackId: string | null,
      dropResult: TimelineTrackDropResult | null,
      penetrationRatio: number
    ) => {
      engine.setClipDropFeedback({
        activeClipId: activeDrag.clipId,
        sourceTrackId: activeDrag.sourceTrackId,
        hoveredTrackId,
        activeTargetTrackId: activeDrag.activeTargetTrackId,
        valid: dropResult?.canDrop ?? false,
        reason: dropResult?.canDrop ? null : (dropResult?.reason ?? null),
        penetrationRatio,
      });
    },
    [engine]
  );

  const startClipDrag = useCallback(
    (input: TimelineClipDragStartInput): TimelineCommandResult => {
      if (activeDragRef.current) {
        return timelineCommandFail('unsupported', 'A drag is already active.');
      }
      if (!Number.isFinite(input.clientX) || !Number.isFinite(input.viewportY)) {
        return timelineCommandFail('invalid-input');
      }
      const found = engine.geometry.getClip(input.clipId);
      const rect =
        input.clipRect ??
        engine.geometry.getClipRect(input.clipId, {
          collapsedTrackHeight: options.collapsedTrackHeight,
          edgeThreshold: options.edgeThreshold,
          rulerHeight: options.rulerHeight,
          touchEdgeThreshold: options.touchEdgeThreshold,
          trackHeight: options.trackHeight,
        });

      if (!found || !rect) {
        return timelineCommandFail('not-found');
      }
      if (found.track.locked || found.clip.movable === false) {
        return timelineCommandFail('locked');
      }

      const trackTargets = dropTargets.trackTargets;
      engine.prepareSnapping({ ignoreClipId: input.clipId, operation: 'move' });
      engine.cancelEdit();

      activeDragRef.current = {
        gesture: new TimelineEditGesture(engine),
        clipId: input.clipId,
        startClientX: input.clientX,
        startLeft: rect.x,
        sourceTrackId: found.track.id,
        sourceTrackIndex: found.trackIndex,
        sourceClipIndex: found.clipIndex,
        previousStartTime: { ...found.clip.timelineStart },
        previousEndTime: { ...found.clip.timelineEnd },
        activeTargetTrackId: found.track.id,
        activeTargetTrackIndex: found.trackIndex,
        allowCrossKindTrackMove: false,
        trackTargets,
      };
      setDragging(true);

      engine.setClipDropFeedback({
        activeClipId: input.clipId,
        sourceTrackId: found.track.id,
        hoveredTrackId: found.track.id,
        activeTargetTrackId: found.track.id,
        valid: true,
        reason: null,
        penetrationRatio: 1,
      });

      return timelineCommandOk();
    },
    [
      dropTargets.trackTargets,
      engine,
      options.collapsedTrackHeight,
      options.edgeThreshold,
      options.rulerHeight,
      options.touchEdgeThreshold,
      options.trackHeight,
    ]
  );

  const moveClipDrag = useCallback(
    (input: TimelineClipDragMoveInput): TimelineCommandResult<TimelineClipMoveResult> => {
      const activeDrag = activeDragRef.current;
      if (!activeDrag) {
        return timelineCommandFail<TimelineClipMoveResult>('unsupported');
      }
      if (!activeDrag.gesture.isCurrent()) {
        return timelineCommandFail('unsupported', 'The drag preview was replaced.');
      }
      if (!Number.isFinite(input.clientX) || !Number.isFinite(input.viewportY)) {
        return timelineCommandFail('invalid-input');
      }

      const hoveredTarget = findTrackTargetAtY(activeDrag.trackTargets, input.viewportY);
      let dropResult: TimelineTrackDropResult | null = null;
      let penetrationRatio = 0;

      if (hoveredTarget) {
        const penetration = getTrackPenetration(
          hoveredTarget,
          activeDrag.activeTargetTrackIndex,
          input.viewportY
        );
        penetrationRatio = penetration.ratio;
        dropResult = dropTargets.canDropClipOnTrack(
          activeDrag.clipId,
          hoveredTarget.track.id,
          activeDrag.sourceTrackId
        );

        const canActivate =
          hoveredTarget.track.id === activeDrag.activeTargetTrackId ||
          (penetration.ratio >= (options.verticalSnapThreshold ?? 0.3) &&
            penetration.pixels >= (options.minVerticalSnapPixels ?? 8));

        if (canActivate && dropResult.canDrop) {
          activeDrag.activeTargetTrackId = hoveredTarget.track.id;
          activeDrag.activeTargetTrackIndex = hoveredTarget.trackIndex;
          activeDrag.allowCrossKindTrackMove = dropResult.allowCrossKindTrackMove;
        }
      }

      publishFeedback(activeDrag, hoveredTarget?.track.id ?? null, dropResult, penetrationRatio);

      const deltaX = input.clientX - activeDrag.startClientX;
      const preview = activeDrag.gesture.publish({
        type: 'move',
        overwrite: true,
        clipId: activeDrag.clipId,
        startTime: engine.pixelToTime(activeDrag.startLeft + deltaX),
        targetTrackId: activeDrag.activeTargetTrackId,
        allowCrossKindTrackMove: activeDrag.allowCrossKindTrackMove,
      });

      return preview.valid && preview.moveResult
        ? timelineCommandOk(preview.moveResult)
        : timelineCommandFail(preview.reason ?? 'unsupported');
    },
    [
      dropTargets,
      engine,
      options.minVerticalSnapPixels,
      options.verticalSnapThreshold,
      publishFeedback,
    ]
  );

  const endClipDrag = useCallback((): TimelineCommandResult => {
    const active = activeDragRef.current;
    if (!active) {
      return timelineCommandFail('unsupported');
    }

    activeDragRef.current = null;
    setDragging(false);
    const current = active.gesture.isCurrent();
    active.gesture.release();
    if (!current) {
      return timelineCommandFail('unsupported', 'The drag preview was replaced.');
    }
    const command = active.gesture.preview?.command;
    const result = command ? engine.commitEdit(command) : undefined;
    engine.cancelEdit();
    engine.clearClipDropFeedback();
    return result && !result.committed
      ? timelineCommandFail(result.preview.reason ?? 'unsupported')
      : timelineCommandOk();
  }, [engine]);

  const cancelClipDrag = useCallback((): TimelineCommandResult => {
    const active = activeDragRef.current;
    if (!active) {
      return timelineCommandFail('unsupported');
    }

    activeDragRef.current = null;
    setDragging(false);
    if (active.gesture.cancel()) {
      engine.clearClipDropFeedback();
    }
    return timelineCommandOk();
  }, [engine]);

  return useMemo(
    () => ({
      dragging,
      dropFeedback: engine.getClipDropFeedback(),
      startClipDrag,
      moveClipDrag,
      endClipDrag,
      cancelClipDrag,
    }),
    [cancelClipDrag, dragging, endClipDrag, engine, moveClipDrag, startClipDrag]
  );
}
