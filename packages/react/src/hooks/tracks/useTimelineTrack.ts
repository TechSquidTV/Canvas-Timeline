import type {
  TimelineTrackGeometryOptions,
  TimelineTrackRect,
  Track,
} from '@techsquidtv/canvas-timeline-core';
import { useCallback, useMemo } from 'react';
import { timelineCommandFail, type TimelineCommandResult } from '../core/timelineCommandResult';
import { useTimeline } from '../core/useTimeline';
import { useTimelineGeometryRevision } from '../core/useTimelineGeometryRevision';
import { useTimelineTracks } from './useTimelineTracks';

/**
 * Result returned by `useTimelineTrack`.
 *
 * @remarks
 *
 * The result is scoped to one track row and includes both state flags and
 * row-level commands. It also includes `rect`, which is aligned with canvas
 * track geometry for DOM overlays, resize handles, and track header layouts.
 *
 * @template TrackKind - App-defined track kind value carried by the requested
 * track.
 *
 * @see {@link useTimelineTrackHeader}
 * @see {@link useTimelineTracks}
 */
export interface UseTimelineTrackResult<TrackKind extends string = string> {
  /** Requested track id. */
  trackId: string;
  /** Current track, or null when the id is missing. */
  track: Track<TrackKind> | null;
  /** Zero-based track index, or -1 when the track is missing. */
  trackIndex: number;
  /** Viewport row rectangle matching canvas track geometry. */
  rect: TimelineTrackRect | null;
  /** Whether the requested track exists. */
  exists: boolean;
  /** App-defined track kind, or null when the track is missing. */
  kind: TrackKind | null;
  /** User-facing track name, when set. */
  name: string | undefined;
  /** Optional track group id. */
  groupId: string | undefined;
  /** Expanded row height in pixels, matching canvas geometry. */
  height: number;
  /** Whether the track itself is selected. */
  selected: boolean;
  /** Whether the track participates in active layer and media lookup. */
  visible: boolean;
  /** Whether the track is muted. */
  muted: boolean;
  /** Whether the track is locked for editing. */
  locked: boolean;
  /** Whether the track is targeted for edit operations. */
  targeted: boolean;
  /** Whether the track row is collapsed. */
  collapsed: boolean;
  /** Selects this track. */
  selectTrack: () => TimelineCommandResult;
  /** Sets or toggles this track's output visibility. */
  toggleVisibility: (visible?: boolean) => TimelineCommandResult;
  /** Sets this track's output visibility. */
  setVisible: (visible: boolean) => TimelineCommandResult;
  /** Sets or toggles this track's muted state. */
  toggleMute: (muted?: boolean) => TimelineCommandResult;
  /** Sets this track's muted state. */
  setMuted: (muted: boolean) => TimelineCommandResult;
  /** Sets or toggles this track's locked state. */
  toggleLock: (locked?: boolean) => TimelineCommandResult;
  /** Sets this track's locked state. */
  setLocked: (locked: boolean) => TimelineCommandResult;
  /** Sets this track's expanded display height in pixels. */
  setTrackHeight: (height: number) => TimelineCommandResult;
  /** Sets or toggles this track's edit-targeted state. */
  toggleTrackTarget: (targeted?: boolean) => TimelineCommandResult;
  /** Sets this track's edit-targeted state. */
  setTrackTarget: (targeted: boolean) => TimelineCommandResult;
  /** Assigns this track to a group, or clears its group. */
  setTrackGroup: (groupId: string | undefined) => TimelineCommandResult;
}

/**
 * Accesses one timeline track with canvas-aligned row geometry and commands.
 *
 * @remarks
 *
 * Use this hook when a component owns controls for one specific row: mute,
 * visibility, lock, targeted state, grouping, or row height. It returns safe
 * no-op failure commands when the track id is missing, so header components can
 * remain mounted while project data changes.
 *
 * @param trackId - Track id to read and update.
 * @param options - Optional track geometry overrides matching the renderer.
 * @template TrackKind - App-defined track kind value carried by the requested
 * track.
 * @returns Track row state, canvas-aligned geometry, and row-scoped commands.
 *
 * @example
 * ```tsx
 * import { useTimelineTrack } from '@techsquidtv/canvas-timeline-react/hooks';
 *
 * export function TrackMuteButton({ trackId }: { trackId: string }) {
 *   const track = useTimelineTrack(trackId);
 *
 *   return (
 *     <button type="button" aria-pressed={track.muted} onClick={() => track.toggleMute()}>
 *       {track.muted ? 'Unmute' : 'Mute'} {track.name ?? track.trackId}
 *     </button>
 *   );
 * }
 * ```
 *
 * @see {@link useTimelineTracks}
 * @see {@link useTimelineTrackHeader}
 * @see {@link https://canvastimeline.com/docs/tracks-and-clips | Tracks and clips}
 */
export function useTimelineTrack<TrackKind extends string = string>(
  trackId: string,
  options: TimelineTrackGeometryOptions = {}
): UseTimelineTrackResult<TrackKind> {
  const { engine, state } = useTimeline();
  const tracksState = useTimelineTracks<TrackKind>();
  const revision = useTimelineGeometryRevision();
  const trackSnapshot = useMemo(() => {
    void revision;
    const tracks = state.tracks as Track<TrackKind>[];
    const trackIndex = tracks.findIndex((candidate) => candidate.id === trackId);
    const track = trackIndex === -1 ? null : tracks[trackIndex];

    if (trackIndex === -1) {
      return {
        track: null,
        trackIndex,
        rect: null,
      };
    }

    const rect =
      engine.getTrackRects({
        collapsedTrackHeight: options.collapsedTrackHeight,
        edgeThreshold: options.edgeThreshold,
        rulerHeight: options.rulerHeight,
        touchEdgeThreshold: options.touchEdgeThreshold,
        trackHeight: options.trackHeight,
        viewportWidth: options.viewportWidth,
      })[trackIndex] ?? null;

    return {
      track,
      trackIndex,
      rect,
    };
  }, [
    engine,
    options.collapsedTrackHeight,
    options.edgeThreshold,
    options.rulerHeight,
    options.touchEdgeThreshold,
    options.trackHeight,
    options.viewportWidth,
    revision,
    state.tracks,
    trackId,
  ]);

  const selectTrack = useCallback(() => tracksState.selectTrack(trackId), [trackId, tracksState]);

  const toggleVisibility = useCallback(
    (visible?: boolean) => tracksState.toggleVisibility(trackId, visible),
    [trackId, tracksState]
  );

  const setVisible = useCallback(
    (visible: boolean) => tracksState.toggleVisibility(trackId, visible),
    [trackId, tracksState]
  );

  const toggleMute = useCallback(
    (muted?: boolean) => tracksState.toggleMute(trackId, muted),
    [trackId, tracksState]
  );

  const setMuted = useCallback(
    (muted: boolean) => tracksState.toggleMute(trackId, muted),
    [trackId, tracksState]
  );

  const toggleLock = useCallback(
    (locked?: boolean) => tracksState.toggleLock(trackId, locked),
    [trackId, tracksState]
  );

  const setLocked = useCallback(
    (locked: boolean) => tracksState.toggleLock(trackId, locked),
    [trackId, tracksState]
  );

  const setTrackHeight = useCallback(
    (height: number) => tracksState.setTrackHeight(trackId, height),
    [trackId, tracksState]
  );

  const toggleTrackTarget = useCallback(
    (targeted?: boolean) => tracksState.toggleTrackTarget(trackId, targeted),
    [trackId, tracksState]
  );

  const setTrackTarget = useCallback(
    (targeted: boolean) => tracksState.toggleTrackTarget(trackId, targeted),
    [trackId, tracksState]
  );

  const setTrackGroup = useCallback(
    (groupId: string | undefined) => tracksState.setTrackGroup(trackId, groupId),
    [trackId, tracksState]
  );

  return useMemo(() => {
    const { rect, track, trackIndex } = trackSnapshot;

    if (track === null) {
      const fail = () => timelineCommandFail('not-found');

      return {
        trackId,
        track: null,
        trackIndex: -1,
        rect: null,
        exists: false,
        kind: null,
        name: undefined,
        groupId: undefined,
        height: 0,
        selected: false,
        visible: false,
        muted: false,
        locked: false,
        targeted: false,
        collapsed: false,
        selectTrack: fail,
        toggleVisibility: fail,
        setVisible: fail,
        toggleMute: fail,
        setMuted: fail,
        toggleLock: fail,
        setLocked: fail,
        setTrackHeight: fail,
        toggleTrackTarget: fail,
        setTrackTarget: fail,
        setTrackGroup: fail,
      };
    }

    return {
      trackId,
      track,
      trackIndex,
      rect,
      exists: true,
      kind: track.kind,
      name: track.name,
      groupId: track.groupId,
      height: rect?.height ?? 0,
      selected: track.selected,
      visible: track.visible,
      muted: track.muted,
      locked: track.locked,
      targeted: track.targeted === true,
      collapsed: track.collapsed === true,
      selectTrack,
      toggleVisibility,
      setVisible,
      toggleMute,
      setMuted,
      toggleLock,
      setLocked,
      setTrackHeight,
      toggleTrackTarget,
      setTrackTarget,
      setTrackGroup,
    };
  }, [
    selectTrack,
    setLocked,
    setMuted,
    setTrackGroup,
    setTrackHeight,
    setTrackTarget,
    setVisible,
    toggleLock,
    toggleMute,
    toggleTrackTarget,
    toggleVisibility,
    trackSnapshot,
    trackId,
  ]);
}
