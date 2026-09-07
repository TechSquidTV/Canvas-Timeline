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

/** Stable delegates; all validation reads the current engine state. */
export function useTimelineTrackCommands(): UseTimelineTrackCommandsResult {
  const engine = useTimelineEngine();
  return useMemo(
    () => ({
      selectTrack: engine.selectTrack.bind(engine),
      addTrack: engine.addTrack.bind(engine),
      removeTrack: engine.removeTrack.bind(engine),
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
