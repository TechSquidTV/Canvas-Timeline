import { useCallback, useMemo, type ButtonHTMLAttributes } from 'react';
import type { TimelineCommandResult } from '@techsquidtv/canvas-timeline-core';
import { useTimelineSelector } from '#react/hooks/core/useTimelineSelector';
import { useTimelineTrackCommands } from '#react/hooks/tracks/useTimelineTrackCommands';
import { getTimelineTrackLabel } from '#react/hooks/tracks/timelineTrackLabel';

/** Props returned for a track lock button. */
export type TimelineTrackLockControlButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

/** Result returned by `useTimelineTrackLockControl`. */
export interface UseTimelineTrackLockControlResult {
  /** Requested track id. */
  trackId: string;
  /** Whether the requested track exists. */
  exists: boolean;
  /** Human-readable track label. */
  label: string;
  /** Whether the track is locked for editing. */
  locked: boolean;
  /** Sets this track's locked state. */
  setLocked: (locked: boolean) => TimelineCommandResult;
  /** Toggles this track's locked state. */
  toggleLock: () => TimelineCommandResult;
  /** Props for a semantic lock toggle button. */
  buttonProps: TimelineTrackLockControlButtonProps;
}

/**
 * Adapts one timeline track into a semantic lock toggle button.
 *
 * @param trackId - Track id to bind.
 * @returns Current lock state, commands, and DOM-ready button props.
 */
export function useTimelineTrackLockControl(trackId: string): UseTimelineTrackLockControlResult {
  const commands = useTimelineTrackCommands();
  const state = useTimelineSelector((snapshot) => {
    const index = snapshot.tracks.findIndex((track) => track.id === trackId);
    const track = snapshot.tracks[index] ?? null;
    return {
      exists: track !== null,
      locked: track?.locked ?? false,
      label: getTimelineTrackLabel(track, index, trackId),
    };
  });

  const setLocked = useCallback(
    (locked: boolean) => commands.setLocked(trackId, locked),
    [commands, trackId]
  );
  const toggleLock = useCallback(() => commands.toggleLock(trackId), [commands, trackId]);

  const buttonProps = useMemo<TimelineTrackLockControlButtonProps>(
    () => ({
      type: 'button',
      'aria-label': state.locked ? `Unlock ${state.label}` : `Lock ${state.label}`,
      'aria-pressed': state.locked,
      title: state.locked ? `Unlock ${state.label}` : `Lock ${state.label}`,
      disabled: !state.exists,
      'data-track-id': trackId,
      'data-track-locked': String(state.locked),
      onClick: () => {
        commands.toggleLock(trackId);
      },
    }),
    [commands, state, trackId]
  );

  return useMemo(
    () => ({
      trackId,
      exists: state.exists,
      label: state.label,
      locked: state.locked,
      setLocked,
      toggleLock,
      buttonProps,
    }),
    [buttonProps, state.exists, state.label, state.locked, setLocked, toggleLock, trackId]
  );
}
