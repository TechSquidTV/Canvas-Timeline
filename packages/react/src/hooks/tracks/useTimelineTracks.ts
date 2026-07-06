import type { Track } from '@techsquidtv/canvas-timeline-core';
import { useCallback, useMemo } from 'react';
import { useTimeline } from '../core/useTimeline';
import {
  timelineCommandFail,
  timelineCommandOk,
  type TimelineCommandResult,
} from '../core/timelineCommandResult';

/**
 * Result returned by `useTimelineTracks`.
 *
 * @remarks
 *
 * Use this result for track lists, timeline sidebars, source-bin filters, and
 * command bars that need to inspect or mutate the ordered track collection. For
 * one row's DOM-ready state, use {@link useTimelineTrack} or
 * {@link useTimelineTrackHeader} instead.
 *
 * @template TrackKind - App-defined track kind values carried by returned
 * tracks, such as `"visual" | "audio"`.
 *
 * @see {@link https://canvastimeline.com/docs/tracks-and-clips | Tracks and clips}
 * @see {@link https://canvastimeline.com/docs/react-hooks | React editor hooks}
 */
export interface UseTimelineTracksResult<TrackKind = string> {
  /** Current ordered track list. */
  tracks: Track<TrackKind>[];
  /** Currently selected track, or null when no track is selected. */
  selectedTrack: Track<TrackKind> | null;
  /** Tracks currently participating in active layer and media lookup. */
  visibleTracks: Track<TrackKind>[];
  /** Tracks currently hidden from active layer and media lookup. */
  hiddenTracks: Track<TrackKind>[];
  /** Tracks currently targeted for edit operations. */
  targetedTracks: Track<TrackKind>[];
  /** Tracks grouped by group id, with ungrouped tracks under "ungrouped". */
  tracksByGroupId: Record<string, Track<TrackKind>[]>;
  /** Selects a track by id, or clears track selection. */
  selectTrack: (trackId: string | null) => TimelineCommandResult;
  /** Adds a track to the timeline. */
  addTrack: (track: Track<TrackKind>) => TimelineCommandResult;
  /** Removes a track from the timeline. */
  removeTrack: (trackId: string) => TimelineCommandResult;
  /** Sets or toggles whether a track is muted. */
  toggleMute: (trackId: string, muted?: boolean) => TimelineCommandResult;
  /** Sets or toggles whether a track participates in active layer and media lookup. */
  toggleVisibility: (trackId: string, visible?: boolean) => TimelineCommandResult;
  /** Sets or toggles whether a track is locked. */
  toggleLock: (trackId: string, locked?: boolean) => TimelineCommandResult;
  /** Sets a track's expanded display height in pixels. */
  setTrackHeight: (trackId: string, height: number) => TimelineCommandResult;
  /** Sets or toggles whether a track is targeted for edit operations. */
  toggleTrackTarget: (trackId: string, targeted?: boolean) => TimelineCommandResult;
  /** Assigns a track to a group, or clears its group. */
  setTrackGroup: (trackId: string, groupId: string | undefined) => TimelineCommandResult;
}

/**
 * Accesses and manages the list of timeline tracks.
 *
 * @remarks
 *
 * `useTimelineTracks` is the broad track-domain hook. It is useful for
 * rendering track rows, building track header columns, grouping tracks, and
 * wiring mute/visibility/lock controls. It returns command helpers that fail
 * with {@link TimelineCommandResult} objects instead of throwing when a track is
 * missing.
 *
 * @returns Track collection state and commands for selecting and updating tracks.
 * @template TrackKind - App-defined track kind values carried by returned
 * tracks, such as `"visual" | "audio"`.
 *
 * @example
 * ```tsx
 * import { Timeline, useTimelineTracks } from '@techsquidtv/canvas-timeline-react';
 *
 * export function TrackRows() {
 *   const { tracks } = useTimelineTracks();
 *
 *   return (
 *     <Timeline.TrackList>
 *       {tracks.map((track) => (
 *         <Timeline.Track key={track.id} trackId={track.id} />
 *       ))}
 *     </Timeline.TrackList>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * import { useTimelineTracks } from '@techsquidtv/canvas-timeline-react/hooks';
 *
 * export function TrackVisibilityMenu() {
 *   const { tracks, toggleVisibility } = useTimelineTracks();
 *
 *   return tracks.map((track) => (
 *     <label key={track.id}>
 *       <input
 *         type="checkbox"
 *         checked={track.visible}
 *         onChange={(event) => toggleVisibility(track.id, event.currentTarget.checked)}
 *       />
 *       {track.name ?? track.id}
 *     </label>
 *   ));
 * }
 * ```
 *
 * @see {@link useTimelineTrack}
 * @see {@link useTimelineTrackHeader}
 * @see {@link https://canvastimeline.com/demos/timeline-editor-controls | Timeline editor controls demo}
 */
export function useTimelineTracks<TrackKind = string>(): UseTimelineTracksResult<TrackKind> {
  const { engine, state } = useTimeline();
  const tracks = useMemo(() => state.tracks as Track<TrackKind>[], [state.tracks]);
  const selectedTrack = useMemo(() => tracks.find((track) => track.selected) || null, [tracks]);
  const visibleTracks = useMemo(() => tracks.filter((track) => track.visible), [tracks]);
  const hiddenTracks = useMemo(() => tracks.filter((track) => !track.visible), [tracks]);
  const targetedTracks = useMemo(() => tracks.filter((track) => track.targeted), [tracks]);
  const tracksByGroupId = useMemo(
    () =>
      tracks.reduce(
        (accumulator, track) => {
          const groupId = track.groupId || 'ungrouped';
          if (!accumulator[groupId]) {
            accumulator[groupId] = [];
          }
          accumulator[groupId].push(track);
          return accumulator;
        },
        {} as Record<string, Track<TrackKind>[]>
      ),
    [tracks]
  );

  const selectTrack = useCallback(
    (trackId: string | null) => {
      if (trackId !== null && !tracks.some((track) => track.id === trackId)) {
        return timelineCommandFail('not-found');
      }
      engine.selectTrack(trackId);
      return timelineCommandOk();
    },
    [engine, tracks]
  );

  const addTrack = useCallback(
    (track: Track<TrackKind>) => {
      engine.addTrack(track as Track);
      return timelineCommandOk();
    },
    [engine]
  );

  const removeTrack = useCallback(
    (trackId: string) => {
      return engine.removeTrack(trackId) ? timelineCommandOk() : timelineCommandFail('not-found');
    },
    [engine]
  );

  const toggleMute = useCallback(
    (trackId: string, muted?: boolean) => {
      if (!tracks.some((track) => track.id === trackId)) {
        return timelineCommandFail('not-found');
      }
      engine.toggleMuteTrack(trackId, muted);
      return timelineCommandOk();
    },
    [engine, tracks]
  );

  const toggleVisibility = useCallback(
    (trackId: string, visible?: boolean) => {
      if (!tracks.some((track) => track.id === trackId)) {
        return timelineCommandFail('not-found');
      }
      engine.toggleTrackVisibility(trackId, visible);
      return timelineCommandOk();
    },
    [engine, tracks]
  );

  const toggleLock = useCallback(
    (trackId: string, locked?: boolean) => {
      if (!tracks.some((track) => track.id === trackId)) {
        return timelineCommandFail('not-found');
      }
      engine.toggleLockTrack(trackId, locked);
      return timelineCommandOk();
    },
    [engine, tracks]
  );

  const setTrackHeight = useCallback(
    (trackId: string, height: number) => {
      if (!tracks.some((track) => track.id === trackId)) {
        return timelineCommandFail('not-found');
      }
      engine.setTrackHeight(trackId, height);
      return timelineCommandOk();
    },
    [engine, tracks]
  );

  const toggleTrackTarget = useCallback(
    (trackId: string, targeted?: boolean) => {
      if (!tracks.some((track) => track.id === trackId)) {
        return timelineCommandFail('not-found');
      }
      engine.toggleTrackTarget(trackId, targeted);
      return timelineCommandOk();
    },
    [engine, tracks]
  );

  const setTrackGroup = useCallback(
    (trackId: string, groupId: string | undefined) => {
      if (!tracks.some((track) => track.id === trackId)) {
        return timelineCommandFail('not-found');
      }
      engine.setTrackGroup(trackId, groupId);
      return timelineCommandOk();
    },
    [engine, tracks]
  );

  return useMemo(
    () => ({
      tracks,
      selectedTrack,
      visibleTracks,
      hiddenTracks,
      targetedTracks,
      tracksByGroupId,
      selectTrack,
      addTrack,
      removeTrack,
      toggleMute,
      toggleVisibility,
      toggleLock,
      setTrackHeight,
      toggleTrackTarget,
      setTrackGroup,
    }),
    [
      addTrack,
      hiddenTracks,
      removeTrack,
      selectTrack,
      selectedTrack,
      setTrackGroup,
      setTrackHeight,
      targetedTracks,
      toggleLock,
      toggleMute,
      toggleVisibility,
      toggleTrackTarget,
      tracksByGroupId,
      tracks,
      visibleTracks,
    ]
  );
}
