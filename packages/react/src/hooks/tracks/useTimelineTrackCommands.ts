import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import type { TimelineCommandResult, Track } from '@techsquidtv/canvas-timeline-core';
import { useMemo } from 'react';

/** Stable track commands; every operation validates current engine state. */
export interface UseTimelineTrackCommandsResult {
  /** Selects a track or clears track selection. */
  selectTrack: (trackId: string | null) => TimelineCommandResult;
  /** Adds a track with owned, validated clip data. */
  addTrack: (track: Track) => TimelineCommandResult;
  /** Removes a track. */
  removeTrack: (trackId: string) => TimelineCommandResult;
  /** Renames a track, or clears its app-defined name. */
  renameTrack: (trackId: string, name: string | undefined) => TimelineCommandResult;
  /** Moves a track to its final zero-based row index. */
  moveTrack: (trackId: string, toIndex: number) => TimelineCommandResult;
  /** Sets row collapse while preserving expanded height and media visibility. */
  setCollapsed: (trackId: string, collapsed: boolean) => TimelineCommandResult;
  /** Toggles row collapse using the current track state. */
  toggleCollapse: (trackId: string) => TimelineCommandResult;
  /** Toggles track mute. */
  toggleMute: (trackId: string) => TimelineCommandResult;
  /** Sets track mute explicitly. */
  setMuted: (trackId: string, muted: boolean) => TimelineCommandResult;
  /** Toggles track output visibility. */
  toggleVisibility: (trackId: string) => TimelineCommandResult;
  /** Sets track output visibility explicitly. */
  setVisible: (trackId: string, visible: boolean) => TimelineCommandResult;
  /** Toggles the edit lock. */
  toggleLock: (trackId: string) => TimelineCommandResult;
  /** Sets the edit lock explicitly. */
  setLocked: (trackId: string, locked: boolean) => TimelineCommandResult;
  /** Sets expanded row height. */
  setTrackHeight: (trackId: string, height: number) => TimelineCommandResult;
  /** Toggles edit targeting. */
  toggleTrackTarget: (trackId: string) => TimelineCommandResult;
  /** Sets edit targeting explicitly. */
  setTrackTarget: (trackId: string, targeted: boolean) => TimelineCommandResult;
  /** Sets or clears a track's group. */
  setTrackGroup: (trackId: string, groupId: string | undefined) => TimelineCommandResult;
}

/**
 * Provides stable track commands without subscribing to track or geometry updates.
 * Compose with `useTimelineTracks` for collection state or `useTimelineTrack`
 * for row state. All commands validate current engine state at invocation.
 * @returns Track selection, organization, and state commands.
 * @example
 * ```tsx
 * const { moveTrack } = useTimelineTrackCommands();
 * return <button onClick={() => moveTrack('audio', 0)}>Move audio to first row</button>;
 * ```
 */
export function useTimelineTrackCommands(): UseTimelineTrackCommandsResult {
  const engine = useTimelineEngine();
  return useMemo(
    () => ({
      selectTrack: engine.selectTrack.bind(engine),
      addTrack: engine.addTrack.bind(engine),
      removeTrack: engine.removeTrack.bind(engine),
      renameTrack: engine.renameTrack.bind(engine),
      moveTrack: engine.moveTrack.bind(engine),
      setCollapsed: engine.setTrackCollapsed.bind(engine),
      toggleCollapse: (trackId) =>
        engine.setTrackCollapsed(
          trackId,
          engine.tracks.find((track) => track.id === trackId)?.collapsed !== true
        ),
      toggleMute: (trackId) => engine.toggleMuteTrack(trackId),
      setMuted: (trackId, muted) => engine.toggleMuteTrack(trackId, muted),
      toggleVisibility: (trackId) => engine.toggleTrackVisibility(trackId),
      setVisible: (trackId, visible) => engine.toggleTrackVisibility(trackId, visible),
      toggleLock: (trackId) => engine.toggleLockTrack(trackId),
      setLocked: (trackId, locked) => engine.toggleLockTrack(trackId, locked),
      setTrackHeight: engine.setTrackHeight.bind(engine),
      toggleTrackTarget: (trackId) => engine.toggleTrackTarget(trackId),
      setTrackTarget: (trackId, targeted) => engine.toggleTrackTarget(trackId, targeted),
      setTrackGroup: engine.setTrackGroup.bind(engine),
    }),
    [engine]
  );
}
