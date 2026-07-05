import { useCallback, useMemo } from 'react';
import type {
  Clip,
  ClipHitTestInput,
  TimelineEngine,
  TimelineClipMoveOptions,
  TimelineClipMoveResult,
  TimelineClipGroup,
  TimelineEditValidationResult,
  TimelineInteractionGeometry,
  Track,
} from '@techsquidtv/canvas-timeline-core';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useTimeline } from '../core/useTimeline';
import { useTimelineSelection } from '../selection/useTimelineSelection';
import { flattenTimelineClips, type TimelineClipEntry } from './timelineClipModel';
import {
  timelineCommandFail,
  timelineCommandOk,
  type TimelineCommandFailureReason,
  type TimelineCommandResult,
} from '../core/timelineCommandResult';

export type { TimelineClipEntry } from './timelineClipModel';

function toTimelineCommandFailureReason(
  reason: TimelineEditValidationResult['reason']
): TimelineCommandFailureReason {
  return reason ?? 'unsupported';
}

/** Editable presentation fields accepted by `useTimelineClips().updateClip`. */
export type TimelineClipUpdate = Partial<Pick<Clip, 'label' | 'opacity' | 'color'>>;

/** Result returned by `useTimelineClips`. */
export interface UseTimelineClipsResult<TrackKind = string> {
  /** Flattened timeline clips in track order. */
  clips: TimelineClipEntry<TrackKind>[];
  /** Currently selected clip, or null when no clip is selected. */
  selectedClip: Clip | null;
  /** ID of the currently selected clip, or null when no clip is selected. */
  selectedClipId: string | null;
  /** ID of the track containing the selected clip, or null when no clip is selected. */
  selectedClipTrackId: string | null;
  /** All selected clips in track order. */
  selectedClips: Clip[];
  /** IDs of all selected clips in track order. */
  selectedClipIds: string[];
  /** Selected group when the primary selected clip belongs to one. */
  selectedGroup: TimelineClipGroup | null;
  /** Selected group id when the primary selected clip belongs to one. */
  selectedGroupId: string | null;
  /** Returns a clip lookup from the engine, including containing track and indexes. */
  getClip: TimelineEngine['getClip'];
  /** Returns the current viewport rectangle for a clip. */
  getClipRect: TimelineEngine['getClipRect'];
  /** Hit-tests timeline clips in viewport coordinates. */
  getClipAtPoint: TimelineEngine['getClipAtPoint'];
  /** Computes the source-media range covered by a clip. */
  getClipSourceRange: TimelineEngine['getClipSourceRange'];
  /** Returns a stable sync key for timing-affecting clip fields. */
  getClipSyncKey: TimelineEngine['getClipSyncKey'];
  /** Maps a timeline timestamp within a clip to matching source-media time. */
  timelineTimeToSourceTime: TimelineEngine['timelineTimeToSourceTime'];
  /** Maps a source-media timestamp within a clip back to timeline time. */
  sourceTimeToTimelineTime: TimelineEngine['sourceTimeToTimelineTime'];
  /** Whether a clip can be moved by headless edit controls. */
  canMoveClip: (clipId: string) => boolean;
  /** Whether a clip can be trimmed by headless edit controls. */
  canTrimClip: (clipId: string) => boolean;
  /** Whether a clip can be slipped by headless edit controls. */
  canSlipClip: (clipId: string) => boolean;
  /** Whether a clip can be slid by headless edit controls. */
  canSlideClip: (clipId: string) => boolean;
  /** Selects a clip by id, or clears clip selection when passed null. */
  selectClip: (clipId: string | null) => TimelineCommandResult;
  /** Moves a clip to an absolute timeline start time and optional destination track. */
  moveClip: (options: TimelineClipMoveOptions) => TimelineCommandResult<TimelineClipMoveResult>;
  /** Trims one clip edge to an absolute timeline time. */
  trimClip: (clipId: string, edge: 'start' | 'end', newTime: RationalTime) => TimelineCommandResult;
  /** Splits a clip at a timeline time, defaulting to the current playhead. */
  splitClip: (clipId: string, time?: RationalTime) => TimelineCommandResult;
  /** Deletes a clip from its containing track. */
  deleteClip: (clipId: string) => TimelineCommandResult;
  /** Updates editable clip presentation fields. */
  updateClip: (clipId: string, properties: TimelineClipUpdate) => TimelineCommandResult;
  /** Moves the visible source range without changing the timeline range. */
  slipClip: (clipId: string, deltaTime: RationalTime) => TimelineCommandResult;
  /** Moves the clip on the timeline by a relative delta. */
  slideClip: (clipId: string, deltaTime: RationalTime) => TimelineCommandResult;
}

/**
 * Provides the canonical clip collection and editing actions for React editor UI.
 *
 * @returns Flattened clips, selected clip metadata, and clip editing commands.
 */
export function useTimelineClips<TrackKind = string>(): UseTimelineClipsResult<TrackKind> {
  const { engine, state } = useTimeline();
  const {
    selectedClip,
    selectedClipId,
    selectedClipTrackId,
    selectedClips,
    selectedClipIds,
    selectedGroup,
    selectedGroupId,
    selectClip,
  } = useTimelineSelection<TrackKind>();

  const clips = useMemo(
    () => flattenTimelineClips(state.tracks as Track<TrackKind>[]),
    [state.tracks]
  );

  const getClip = useCallback((clipId: string) => engine.getClip(clipId), [engine]);
  const getClipRect = useCallback(
    (clipId: string, geometry?: TimelineInteractionGeometry) =>
      engine.getClipRect(clipId, geometry),
    [engine]
  );
  const getClipAtPoint = useCallback(
    (input: ClipHitTestInput) => engine.getClipAtPoint(input),
    [engine]
  );
  const getClipSourceRange = useCallback(
    (clipIdOrClip: string | Clip) => engine.getClipSourceRange(clipIdOrClip),
    [engine]
  );
  const getClipSyncKey = useCallback(
    (clipIdOrClip: string | Clip) => engine.getClipSyncKey(clipIdOrClip),
    [engine]
  );
  const timelineTimeToSourceTime = useCallback(
    (clipIdOrClip: string | Clip, timelineTime?: RationalTime) =>
      engine.timelineTimeToSourceTime(clipIdOrClip, timelineTime),
    [engine]
  );
  const sourceTimeToTimelineTime = useCallback(
    (clipIdOrClip: string | Clip, sourceTime: RationalTime) =>
      engine.sourceTimeToTimelineTime(clipIdOrClip, sourceTime),
    [engine]
  );
  const canMoveClip = useCallback(
    (clipId: string) => {
      const found = engine.getClip(clipId);
      return Boolean(found && !found.track.locked && found.clip.movable !== false);
    },
    [engine]
  );

  const canTrimClip = useCallback(
    (clipId: string) => {
      const found = engine.getClip(clipId);
      return Boolean(found && !found.track.locked && found.clip.resizable !== false);
    },
    [engine]
  );

  const canSlipClip = useCallback(
    (clipId: string) => {
      const found = engine.getClip(clipId);
      return Boolean(found && !found.track.locked && found.clip.resizable !== false);
    },
    [engine]
  );

  const canSlideClip = useCallback(
    (clipId: string) => {
      const found = engine.getClip(clipId);
      return Boolean(found && !found.track.locked && found.clip.movable !== false);
    },
    [engine]
  );

  const selectTimelineClip = useCallback(
    (clipId: string | null) => {
      if (clipId !== null && !engine.getClip(clipId)) {
        return timelineCommandFail('not-found');
      }
      selectClip(clipId);
      return timelineCommandOk();
    },
    [engine, selectClip]
  );

  const moveClip = useCallback(
    (options: TimelineClipMoveOptions) => {
      const found = engine.getClip(options.clipId);
      if (!found) {
        return timelineCommandFail<TimelineClipMoveResult>('not-found');
      }
      if (found.track.locked || found.clip.movable === false) {
        return timelineCommandFail<TimelineClipMoveResult>('locked');
      }

      const targetTrackId = options.targetTrackId ?? found.track.id;
      const targetTrack = state.tracks.find((track) => track.id === targetTrackId);
      if (!targetTrack) {
        return timelineCommandFail<TimelineClipMoveResult>('invalid-track');
      }
      if (targetTrack.locked) {
        return timelineCommandFail<TimelineClipMoveResult>('locked');
      }
      if (targetTrack.kind !== found.track.kind && options.allowCrossKindTrackMove !== true) {
        return timelineCommandFail<TimelineClipMoveResult>('incompatible-track-kind');
      }

      const previousStartTime = { ...found.clip.timelineStart };
      const previousEndTime = { ...found.clip.timelineEnd };
      const sourceTrackId = found.track.id;
      const sourceTrackIndex = found.trackIndex;
      const sourceClipIndex = found.clipIndex;

      const commit = engine.commitEdit({ type: 'move', ...options });
      if (!commit.committed) {
        return timelineCommandFail<TimelineClipMoveResult>(
          toTimelineCommandFailureReason(commit.preview.reason),
          commit.preview.message
        );
      }

      const moved = engine.getClip(options.clipId);
      if (!moved) {
        return timelineCommandFail<TimelineClipMoveResult>('not-found');
      }

      return timelineCommandOk<TimelineClipMoveResult>({
        clipId: options.clipId,
        clip: moved.clip,
        sourceTrackId,
        destinationTrackId: moved.track.id,
        sourceTrackIndex,
        destinationTrackIndex: moved.trackIndex,
        sourceClipIndex,
        destinationClipIndex: moved.clipIndex,
        previousStartTime,
        previousEndTime,
        startTime: { ...moved.clip.timelineStart },
        endTime: { ...moved.clip.timelineEnd },
        changedClips: commit.preview.changedClips,
      });
    },
    [engine, state.tracks]
  );

  const trimClip = useCallback(
    (clipId: string, edge: 'start' | 'end', newTime: RationalTime) => {
      const found = engine.getClip(clipId);
      if (!found) {
        return timelineCommandFail('not-found');
      }
      if (found.track.locked || found.clip.resizable === false) {
        return timelineCommandFail('locked');
      }
      const commit = engine.commitEdit({ type: 'trim', clipId, edge, newTime });
      return commit.committed
        ? timelineCommandOk()
        : timelineCommandFail(
            toTimelineCommandFailureReason(commit.preview.reason),
            commit.preview.message
          );
    },
    [engine]
  );

  const splitClip = useCallback(
    (clipId: string, time: RationalTime = engine.playheadTime) => {
      const found = engine.getClip(clipId);
      if (!found) {
        return timelineCommandFail('not-found');
      }
      return engine.splitClip(clipId, time)
        ? timelineCommandOk()
        : timelineCommandFail('invalid-range');
    },
    [engine]
  );

  const deleteClip = useCallback(
    (clipId: string) =>
      engine.deleteClip(clipId) ? timelineCommandOk() : timelineCommandFail('not-found'),
    [engine]
  );

  const updateClip = useCallback(
    (clipId: string, properties: TimelineClipUpdate) => {
      return engine.updateClipProperties(clipId, properties)
        ? timelineCommandOk()
        : timelineCommandFail('not-found');
    },
    [engine]
  );

  const slipClip = useCallback(
    (clipId: string, deltaTime: RationalTime) => {
      const found = engine.getClip(clipId);
      if (!found) {
        return timelineCommandFail('not-found');
      }
      if (found.track.locked || found.clip.resizable === false) {
        return timelineCommandFail('locked');
      }
      const commit = engine.commitEdit({ type: 'slip', clipId, deltaTime });
      return commit.committed
        ? timelineCommandOk()
        : timelineCommandFail(
            toTimelineCommandFailureReason(commit.preview.reason),
            commit.preview.message
          );
    },
    [engine]
  );

  const slideClip = useCallback(
    (clipId: string, deltaTime: RationalTime) => {
      const found = engine.getClip(clipId);
      if (!found) {
        return timelineCommandFail('not-found');
      }
      if (found.track.locked || found.clip.movable === false) {
        return timelineCommandFail('locked');
      }
      const commit = engine.commitEdit({ type: 'slide', clipId, deltaTime });
      return commit.committed
        ? timelineCommandOk()
        : timelineCommandFail(
            toTimelineCommandFailureReason(commit.preview.reason),
            commit.preview.message
          );
    },
    [engine]
  );

  return {
    clips,
    selectedClip,
    selectedClipId,
    selectedClipTrackId,
    selectedClips,
    selectedClipIds,
    selectedGroup,
    selectedGroupId,
    getClip,
    getClipRect,
    getClipAtPoint,
    getClipSourceRange,
    getClipSyncKey,
    timelineTimeToSourceTime,
    sourceTimeToTimelineTime,
    canMoveClip,
    canTrimClip,
    canSlipClip,
    canSlideClip,
    selectClip: selectTimelineClip,
    moveClip,
    trimClip,
    splitClip,
    deleteClip,
    updateClip,
    slipClip,
    slideClip,
  };
}
