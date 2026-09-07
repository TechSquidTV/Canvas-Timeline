import { useTimelineTrackCommands } from '#react/hooks/tracks/useTimelineTrackCommands';
import type {
  TimelineCommandResult,
  Track,
  TimelineReadonly,
} from '@techsquidtv/canvas-timeline-core';
import { useTimelineSelector } from '#react/hooks/core/useTimelineSelector';
import { useMemo } from 'react';
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
 * tracks, such as `"visual" | "audio"`.
 *
 * @see {@link https://canvastimeline.com/docs/tracks-and-clips | Tracks and clips}
 * @see {@link https://canvastimeline.com/docs/react-hooks | React editor hooks}
 */
export interface UseTimelineTracksResult {
  /** Current ordered track list. */
  tracks: readonly TimelineReadonly<Track>[];
  /** Currently selected track, or null when no track is selected. */
  selectedTrack: TimelineReadonly<Track> | null;
  /** Tracks currently participating in active layer and media lookup. */
  visibleTracks: TimelineReadonly<Track>[];
  /** Tracks currently hidden from active layer and media lookup. */
  hiddenTracks: TimelineReadonly<Track>[];
  /** Tracks currently targeted for edit operations. */
  targetedTracks: TimelineReadonly<Track>[];
  /** Tracks grouped by group id, with ungrouped tracks under "ungrouped". */
  tracksByGroupId: Record<string, TimelineReadonly<Track>[]>;
  /** Selects a track by id, or clears track selection. */
  selectTrack: (trackId: string | null) => TimelineCommandResult;
  /** Adds a track to the timeline. */
  addTrack: (track: Track) => TimelineCommandResult;
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
 * import { useTimelineTracks } from '@techsquidtv/canvas-timeline-react';
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
export function useTimelineTracks(): UseTimelineTracksResult {
  const commands = useTimelineTrackCommands();
  const state = useTimelineSelector((state) => ({ tracks: state.tracks }));
  const tracks = state.tracks;
  const selectedTrack = useMemo(() => tracks.find((track) => track.selected) || null, [tracks]);
  const visibleTracks = useMemo(() => tracks.filter((track) => track.visible), [tracks]);
  const hiddenTracks = useMemo(() => tracks.filter((track) => !track.visible), [tracks]);
  const targetedTracks = useMemo(() => tracks.filter((track) => track.targeted), [tracks]);
  const tracksByGroupId = useMemo(() => {
    const groupedTracks: Record<string, TimelineReadonly<Track>[]> = {};
    for (const track of tracks) {
      const groupId = track.groupId || 'ungrouped';
      groupedTracks[groupId] ??= [];
      groupedTracks[groupId].push(track);
    }
    return groupedTracks;
  }, [tracks]);

  return useMemo(
    () => ({
      tracks,
      selectedTrack,
      visibleTracks,
      hiddenTracks,
      targetedTracks,
      tracksByGroupId,
      ...commands,
    }),
    [tracks, selectedTrack, visibleTracks, hiddenTracks, targetedTracks, tracksByGroupId, commands]
  );
}
