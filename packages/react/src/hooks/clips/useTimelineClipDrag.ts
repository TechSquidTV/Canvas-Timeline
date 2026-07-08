import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  TimelineClipMoveResult,
  ClipViewportRect,
  TimelineClipDropFeedback,
  TimelineInteractionGeometry,
  TimelineTrackHitTestResult,
} from '@techsquidtv/canvas-timeline-core';
import { useTimeline } from '#react/hooks/core/useTimeline';
import {
  useTimelineTrackDropTargets,
  type TimelineTrackDropGuard,
  type TimelineTrackDropResult,
} from '#react/hooks/tracks/useTimelineTrackDropTargets';
import {
  timelineCommandFail,
  timelineCommandOk,
  type TimelineCommandResult,
} from '#react/hooks/core/timelineCommandResult';

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
 * @template TrackKind - App-defined track kind values carried by target tracks,
 * such as `"visual" | "audio"`.
 *
 * @see {@link useTimelineTrackDropTargets}
 * @see {@link https://canvastimeline.com/docs/tracks-and-clips | Tracks and clips}
 */
export interface UseTimelineClipDragOptions<
  TrackKind = string,
> extends TimelineInteractionGeometry {
  /** Portion of another track the pointer must enter before snapping vertically. Defaults to 0.3. */
  verticalSnapThreshold?: number;
  /** Minimum vertical pixels required before snapping vertically. Defaults to 8. */
  minVerticalSnapPixels?: number;
  /** Optional viewport width used for track row geometry. */
  viewportWidth?: number;
  /** Optional app policy for accepting, rejecting, or expanding drop targets. */
  canDropClipOnTrack?: TimelineTrackDropGuard<TrackKind>;
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
  /** Cancels pointer handling for the active drag and settles current preview state. */
  cancelClipDrag: () => TimelineCommandResult;
}

interface ActiveClipDrag<TrackKind = string> {
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
  trackTargets: TimelineTrackHitTestResult<TrackKind>[];
}

function clampRatio(value: number) {
  return Math.max(0, Math.min(1, value));
}

function findTrackTargetAtY<TrackKind>(
  trackTargets: TimelineTrackHitTestResult<TrackKind>[],
  viewportY: number
) {
  return (
    trackTargets.find(({ rect }) => viewportY >= rect.y && viewportY < rect.y + rect.height) ?? null
  );
}

function getTrackPenetration<TrackKind>(
  target: TimelineTrackHitTestResult<TrackKind>,
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
 * @template TrackKind - App-defined track kind values carried by target tracks.
 * @returns Clip drag state and commands for pointer-driven body moves.
 *
 * @example
 * ```tsx
 * import { useTimelineClipDrag } from '#react/hooks';
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
export function useTimelineClipDrag<TrackKind = string>(
  options: UseTimelineClipDragOptions<TrackKind> = {}
): UseTimelineClipDragResult {
  const { engine } = useTimeline();
  const activeDragRef = useRef<ActiveClipDrag<TrackKind> | null>(null);
  const [dragging, setDragging] = useState(false);
  const dropTargets = useTimelineTrackDropTargets<TrackKind>({
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
      if (!activeDragRef.current) {
        return;
      }

      activeDragRef.current = null;
      setDragging(false);
      engine.endDrag();
      engine.settle();
    };
  }, [engine]);

  const publishFeedback = useCallback(
    (
      activeDrag: ActiveClipDrag<TrackKind>,
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
      const found = engine.getClip(input.clipId);
      const rect =
        input.clipRect ??
        engine.getClipRect(input.clipId, {
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
      engine.startDrag();

      activeDragRef.current = {
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
      const moved = engine.moveClip({
        clipId: activeDrag.clipId,
        startTime: engine.pixelToTime(activeDrag.startLeft + deltaX),
        targetTrackId: activeDrag.activeTargetTrackId,
        allowCrossKindTrackMove: activeDrag.allowCrossKindTrackMove,
      });

      if (!moved) {
        return timelineCommandFail<TimelineClipMoveResult>('unsupported');
      }

      const found = engine.getClip(activeDrag.clipId);
      if (!found) {
        return timelineCommandFail<TimelineClipMoveResult>('not-found');
      }

      return timelineCommandOk<TimelineClipMoveResult>({
        clipId: activeDrag.clipId,
        clip: found.clip,
        sourceTrackId: activeDrag.sourceTrackId,
        destinationTrackId: found.track.id,
        sourceTrackIndex: activeDrag.sourceTrackIndex,
        destinationTrackIndex: found.trackIndex,
        sourceClipIndex: activeDrag.sourceClipIndex,
        destinationClipIndex: found.clipIndex,
        previousStartTime: activeDrag.previousStartTime,
        previousEndTime: activeDrag.previousEndTime,
        startTime: { ...found.clip.timelineStart },
        endTime: { ...found.clip.timelineEnd },
        changedClips: engine.getClipGroupForClip(activeDrag.clipId)?.clipIds.flatMap((clipId) => {
          const grouped = engine.getClip(clipId);
          return grouped === undefined ? [] : [grouped.clip];
        }) ?? [found.clip],
      });
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
    if (!activeDragRef.current) {
      return timelineCommandFail('unsupported');
    }

    activeDragRef.current = null;
    setDragging(false);
    engine.endDrag();
    engine.settle();
    return timelineCommandOk();
  }, [engine]);

  const cancelClipDrag = useCallback((): TimelineCommandResult => {
    if (!activeDragRef.current) {
      engine.clearClipDropFeedback();
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
      dropFeedback: engine.getClipDropFeedback(),
      startClipDrag,
      moveClipDrag,
      endClipDrag,
      cancelClipDrag,
    }),
    [cancelClipDrag, dragging, endClipDrag, engine, moveClipDrag, startClipDrag]
  );
}
