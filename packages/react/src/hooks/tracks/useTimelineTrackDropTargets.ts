import { useCallback, useMemo } from 'react';
import type {
  Clip,
  TimelineClipDropFailureReason,
  TimelineInteractionGeometry,
  TimelineTrackGeometryOptions,
  TimelineTrackHitTestResult,
  Track,
  TrackHitTestInput,
} from '@techsquidtv/canvas-timeline-core';
import { useTimeline } from '../core/useTimeline';
import { useTimelineGeometryRevision } from '../core/useTimelineGeometryRevision';

/** Context passed to custom clip track-drop guards. */
export interface TimelineTrackDropContext<TrackKind = string> {
  /** Clip being moved. */
  clip: Clip;
  /** Track that contained the clip at drag start. */
  sourceTrack: Track<TrackKind>;
  /** Candidate destination track. */
  targetTrack: Track<TrackKind>;
  /** Source track index at drag start. */
  sourceTrackIndex: number;
  /** Candidate destination track index. */
  targetTrackIndex: number;
}

/** Result of resolving whether a clip may drop on a track. */
export interface TimelineTrackDropResult {
  /** Whether the target track accepts the clip. */
  canDrop: boolean;
  /** Machine-readable failure reason when `canDrop` is false. */
  reason: TimelineClipDropFailureReason | null;
  /** Whether the engine should permit a cross-kind transfer. */
  allowCrossKindTrackMove: boolean;
}

/** Custom policy for accepting or rejecting track drop targets. */
export type TimelineTrackDropGuard<TrackKind = string> = (
  context: TimelineTrackDropContext<TrackKind>
) => boolean | TimelineTrackDropResult;

/** Options accepted by `useTimelineTrackDropTargets`. */
export interface UseTimelineTrackDropTargetsOptions<
  TrackKind = string,
> extends TimelineTrackGeometryOptions {
  /** Optional app policy for accepting, rejecting, or expanding drop targets. */
  canDropClipOnTrack?: TimelineTrackDropGuard<TrackKind>;
}

/** Result returned by `useTimelineTrackDropTargets`. */
export interface UseTimelineTrackDropTargetsResult<TrackKind = string> {
  /** Viewport-space track rows in timeline order. */
  trackTargets: TimelineTrackHitTestResult<TrackKind>[];
  /** Hit-tests timeline tracks in viewport coordinates. */
  getTrackAtViewportPoint: (
    input: TrackHitTestInput
  ) => TimelineTrackHitTestResult<TrackKind> | null;
  /** Resolves whether one clip may drop on one candidate track. */
  canDropClipOnTrack: (
    clipId: string,
    targetTrackId: string,
    sourceTrackId?: string
  ) => TimelineTrackDropResult;
}

const acceptedDropResult: TimelineTrackDropResult = {
  canDrop: true,
  reason: null,
  allowCrossKindTrackMove: false,
};

function isTrackDropTarget<TrackKind>(
  target: TimelineTrackHitTestResult<TrackKind> | null
): target is TimelineTrackHitTestResult<TrackKind> {
  return target !== null;
}

function normalizeGuardResult(
  result: boolean | TimelineTrackDropResult,
  allowCrossKindTrackMove: boolean
): TimelineTrackDropResult {
  if (typeof result === 'boolean') {
    return {
      canDrop: result,
      reason: result ? null : 'unsupported',
      allowCrossKindTrackMove: result ? allowCrossKindTrackMove : false,
    };
  }

  return {
    canDrop: result.canDrop,
    reason: result.canDrop ? null : (result.reason ?? 'unsupported'),
    allowCrossKindTrackMove: result.canDrop
      ? result.allowCrossKindTrackMove || allowCrossKindTrackMove
      : false,
  };
}

/**
 * Builds headless track drop targets for cross-track clip movement.
 *
 * @param options - Track geometry and optional drop policy used to resolve compatible tracks.
 */
export function useTimelineTrackDropTargets<TrackKind = string>(
  options: UseTimelineTrackDropTargetsOptions<TrackKind> = {}
): UseTimelineTrackDropTargetsResult<TrackKind> {
  const customCanDropClipOnTrack = options.canDropClipOnTrack;
  const collapsedTrackHeight = options.collapsedTrackHeight;
  const edgeThreshold = options.edgeThreshold;
  const rulerHeight = options.rulerHeight;
  const touchEdgeThreshold = options.touchEdgeThreshold;
  const trackHeight = options.trackHeight;
  const viewportWidth = options.viewportWidth;
  const { engine, state } = useTimeline();
  const revision = useTimelineGeometryRevision();

  const geometry = useMemo<TimelineInteractionGeometry>(
    () => ({
      collapsedTrackHeight,
      edgeThreshold,
      rulerHeight,
      touchEdgeThreshold,
      trackHeight,
    }),
    [collapsedTrackHeight, edgeThreshold, rulerHeight, touchEdgeThreshold, trackHeight]
  );

  const trackTargets = useMemo(() => {
    void revision;
    const tracks = state.tracks as Track<TrackKind>[];
    return engine
      .getTrackRects({ ...geometry, viewportWidth })
      .map((rect) => {
        const track = tracks[rect.trackIndex];
        return track === undefined
          ? null
          : {
              track,
              trackIndex: rect.trackIndex,
              rect,
            };
      })
      .filter(isTrackDropTarget);
  }, [engine, geometry, revision, state.tracks, viewportWidth]);

  const getTrackAtViewportPoint = useCallback(
    (input: TrackHitTestInput) =>
      engine.getTrackAtPoint<TrackKind>({
        ...geometry,
        viewportWidth,
        ...input,
      }),
    [engine, geometry, viewportWidth]
  );

  const canDropClipOnTrack = useCallback(
    (clipId: string, targetTrackId: string, sourceTrackId?: string): TimelineTrackDropResult => {
      const found = engine.getClip(clipId);
      if (!found) {
        return { canDrop: false, reason: 'not-found', allowCrossKindTrackMove: false };
      }

      const sourceTrack =
        sourceTrackId === undefined
          ? (found.track as Track<TrackKind>)
          : ((state.tracks as Track<TrackKind>[]).find((track) => track.id === sourceTrackId) ??
            null);
      const targetTrack =
        (state.tracks as Track<TrackKind>[]).find((track) => track.id === targetTrackId) ?? null;

      if (!sourceTrack || !targetTrack) {
        return { canDrop: false, reason: 'invalid-track', allowCrossKindTrackMove: false };
      }
      if (found.clip.movable === false || sourceTrack.locked || targetTrack.locked) {
        return { canDrop: false, reason: 'locked', allowCrossKindTrackMove: false };
      }

      const sourceTrackIndex = (state.tracks as Track<TrackKind>[]).findIndex(
        (track) => track.id === sourceTrack.id
      );
      const targetTrackIndex = (state.tracks as Track<TrackKind>[]).findIndex(
        (track) => track.id === targetTrack.id
      );
      const sameKind = sourceTrack.kind === targetTrack.kind;

      if (!sameKind && !customCanDropClipOnTrack) {
        return {
          canDrop: false,
          reason: 'incompatible-track-kind',
          allowCrossKindTrackMove: false,
        };
      }

      if (!customCanDropClipOnTrack) {
        return acceptedDropResult;
      }

      return normalizeGuardResult(
        customCanDropClipOnTrack({
          clip: found.clip,
          sourceTrack,
          targetTrack,
          sourceTrackIndex,
          targetTrackIndex,
        }),
        !sameKind
      );
    },
    [customCanDropClipOnTrack, engine, state.tracks]
  );

  return useMemo(
    () => ({
      trackTargets,
      getTrackAtViewportPoint,
      canDropClipOnTrack,
    }),
    [canDropClipOnTrack, getTrackAtViewportPoint, trackTargets]
  );
}
