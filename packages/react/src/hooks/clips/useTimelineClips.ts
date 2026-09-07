import { flattenTimelineClips } from '#react/hooks/clips/timelineClipModel';
import type { TimelineClipEntry } from '#react/hooks/clips/timelineClipModel';
import type {
  TimelineCommandResult,
  Clip,
  TimelineReadonly,
  ClipHitTestInput,
  TimelineClipGroup,
  TimelineEngine,
  TimelineInteractionGeometry,
} from '@techsquidtv/canvas-timeline-core';
import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { useTimelineSelector } from '#react/hooks/core/useTimelineSelector';
import { useTimelineSelection } from '#react/hooks/selection/useTimelineSelection';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useCallback, useMemo } from 'react';
export type { TimelineClipEntry } from '#react/hooks/clips/timelineClipModel';

/**
 * Editable presentation fields accepted by `useTimelineClips().updateClip`.
 *
 * @remarks
 *
 * These fields are intentionally presentation-only. Timeline structure, timing,
 * track placement, and source offsets should go through the command-layer hook
 * so the engine can validate edits and preserve history.
 *
 * @see {@link https://canvastimeline.com/docs/tracks-and-clips | Tracks and clips}
 */
export type TimelineClipUpdate = Partial<Pick<Clip, 'label' | 'opacity' | 'color'>>;

/**
 * Result returned by `useTimelineClips`.
 *
 * @remarks
 *
 * The result combines a flattened clip list, selected-clip metadata, geometry
 * helpers, source-time mapping helpers, and safe edit commands. Use it for
 * command bars, inspectors, context menus, and custom clip panels. For live
 * drag affordances, combine it with {@link useTimelineClipDrag} and
 * {@link useTimelineClipDropFeedback}.
 *
 *
 * @see {@link https://canvastimeline.com/docs/tracks-and-clips | Tracks and clips}
 * @see {@link https://canvastimeline.com/docs/react-hooks | React editor hooks}
 */
export interface UseTimelineClipsResult {
  /** Flattened timeline clips in track order. */
  clips: TimelineReadonly<TimelineClipEntry>[];
  /** Currently selected clip, or null when no clip is selected. */
  selectedClip: TimelineReadonly<Clip> | null;
  /** ID of the currently selected clip, or null when no clip is selected. */
  selectedClipId: string | null;
  /** ID of the track containing the selected clip, or null when no clip is selected. */
  selectedClipTrackId: string | null;
  /** All selected clips in track order. */
  selectedClips: TimelineReadonly<Clip>[];
  /** IDs of all selected clips in track order. */
  selectedClipIds: string[];
  /** Selected group when the primary selected clip belongs to one. */
  selectedGroup: TimelineReadonly<TimelineClipGroup> | null;
  /** Selected group id when the primary selected clip belongs to one. */
  selectedGroupId: string | null;
  /** Returns a clip lookup from the engine, including containing track and indexes. */
  getClip: TimelineEngine['geometry']['getClip'];
  /** Returns the current viewport rectangle for a clip. */
  getClipRect: TimelineEngine['geometry']['getClipRect'];
  /** Hit-tests timeline clips in viewport coordinates. */
  getClipAtPoint: TimelineEngine['geometry']['getClipAtPoint'];
  /** Computes the source-media range covered by a clip. */
  getClipSourceRange: TimelineEngine['media']['getClipSourceRange'];
  /** Returns a stable sync key for timing-affecting clip fields. */
  getClipSyncKey: TimelineEngine['media']['getClipSyncKey'];
  /** Maps a timeline timestamp within a clip to matching source-media time. */
  timelineTimeToSourceTime: TimelineEngine['media']['timelineTimeToSourceTime'];
  /** Maps a source-media timestamp within a clip back to timeline time. */
  sourceTimeToTimelineTime: TimelineEngine['media']['sourceTimeToTimelineTime'];
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
  /** Updates editable clip presentation fields. */
  updateClip: (clipId: string, properties: TimelineClipUpdate) => TimelineCommandResult;
}

/**
 * Provides the canonical clip collection and clip metadata for React editor UI.
 *
 * @remarks
 *
 * `useTimelineClips` is the broad clip-domain hook. It is appropriate for
 * product chrome that needs clip read state, selection metadata, geometry
 * helpers, and presentation updates, such as a clip inspector, project panel,
 * or timeline command palette. It does not subscribe to per-frame playback
 * ticks; geometry helpers read from the engine when a command or render path
 * asks for them.
 *
 * Use {@link useTimelineEditCommands} for structural timeline edits such as
 * move, trim, split, insert, overwrite, and delete.
 *
 * @returns Flattened clips, selected clip metadata, clip lookups, and presentation commands.
 *
 * @example
 * ```tsx
 * import { useTimelineClips } from '@techsquidtv/canvas-timeline-react';
 *
 * export function ClipLabelEditor() {
 *   const { selectedClip, updateClip } = useTimelineClips();
 *
 *   if (!selectedClip) {
 *     return null;
 *   }
 *
 *   return (
 *     <input
 *       value={selectedClip.label ?? ''}
 *       onChange={(event) => updateClip(selectedClip.id, { label: event.target.value })}
 *     />
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * import { toSeconds } from '@techsquidtv/canvas-timeline-utils';
 * import { useTimelineClips } from '@techsquidtv/canvas-timeline-react';
 *
 * export function ClipInspector() {
 *   const { selectedClip, selectedClipTrackId, timelineTimeToSourceTime } = useTimelineClips();
 *
 *   if (!selectedClip) {
 *     return <p>No clip selected</p>;
 *   }
 *
 *   const sourceTime = timelineTimeToSourceTime(selectedClip, selectedClip.timelineStart);
 *
 *   return (
 *     <dl>
 *       <dt>Track</dt>
 *       <dd>{selectedClipTrackId}</dd>
 *       <dt>Source start</dt>
 *       <dd>{sourceTime === undefined ? 'Outside clip' : `${toSeconds(sourceTime).toFixed(2)}s`}</dd>
 *     </dl>
 *   );
 * }
 * ```
 *
 * @see {@link useTimelineSelection}
 * @see {@link useTimelineClipDrag}
 * @see {@link useTimelineEditCommands}
 * @see {@link https://canvastimeline.com/demos/timeline-editor-controls | Timeline editor controls demo}
 */
export function useTimelineClips(): UseTimelineClipsResult {
  const engine = useTimelineEngine();
  const state = useTimelineSelector((state) => ({ tracks: state.tracks }));
  const {
    selectedClip,
    selectedClipId,
    selectedClipTrackId,
    selectedClips,
    selectedClipIds,
    selectedGroup,
    selectedGroupId,
    selectClip,
  } = useTimelineSelection();

  const clips = useMemo(() => flattenTimelineClips(state.tracks), [state.tracks]);

  const getClip = useCallback((clipId: string) => engine.geometry.getClip(clipId), [engine]);
  const getClipRect = useCallback(
    (clipId: string, geometry?: TimelineInteractionGeometry) =>
      engine.geometry.getClipRect(clipId, geometry),
    [engine]
  );
  const getClipAtPoint = useCallback(
    (input: ClipHitTestInput) => engine.geometry.getClipAtPoint(input),
    [engine]
  );
  const getClipSourceRange = useCallback(
    (clipIdOrClip: string | TimelineReadonly<Clip>) =>
      engine.media.getClipSourceRange(clipIdOrClip),
    [engine]
  );
  const getClipSyncKey = useCallback(
    (clipIdOrClip: string | TimelineReadonly<Clip>) => engine.media.getClipSyncKey(clipIdOrClip),
    [engine]
  );
  const timelineTimeToSourceTime = useCallback(
    (clipIdOrClip: string | TimelineReadonly<Clip>, timelineTime?: RationalTime) =>
      engine.media.timelineTimeToSourceTime(clipIdOrClip, timelineTime),
    [engine]
  );
  const sourceTimeToTimelineTime = useCallback(
    (clipIdOrClip: string | TimelineReadonly<Clip>, sourceTime: RationalTime) =>
      engine.media.sourceTimeToTimelineTime(clipIdOrClip, sourceTime),
    [engine]
  );
  const canMoveClip = useCallback(
    (clipId: string) => {
      const found = engine.geometry.getClip(clipId);
      return Boolean(found && !found.track.locked && found.clip.movable !== false);
    },
    [engine]
  );

  const canTrimClip = useCallback(
    (clipId: string) => {
      const found = engine.geometry.getClip(clipId);
      return Boolean(found && !found.track.locked && found.clip.resizable !== false);
    },
    [engine]
  );

  const canSlipClip = useCallback(
    (clipId: string) => {
      const found = engine.geometry.getClip(clipId);
      return Boolean(found && !found.track.locked && found.clip.resizable !== false);
    },
    [engine]
  );

  const canSlideClip = useCallback(
    (clipId: string) => {
      const found = engine.geometry.getClip(clipId);
      return Boolean(found && !found.track.locked && found.clip.movable !== false);
    },
    [engine]
  );

  const updateClip = useCallback(
    (clipId: string, properties: TimelineClipUpdate) => {
      return engine.updateClipProperties(clipId, properties);
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
    selectClip,
    updateClip,
  };
}
