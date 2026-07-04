import { useCallback, useMemo, type ButtonHTMLAttributes } from 'react';
import type { TimelineCommandResult } from '../core/timelineCommandResult';
import { useTimelineTrackHeader } from './useTimelineTrackHeader';

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
  const header = useTimelineTrackHeader(trackId);

  const setLocked = useCallback((locked: boolean) => header.setLocked(locked), [header]);
  const toggleLock = useCallback(() => header.toggleLock(), [header]);

  const buttonProps = useMemo<TimelineTrackLockControlButtonProps>(
    () => ({
      type: 'button',
      'aria-label': header.locked ? `Unlock ${header.label}` : `Lock ${header.label}`,
      'aria-pressed': header.locked,
      title: header.locked ? `Unlock ${header.label}` : `Lock ${header.label}`,
      disabled: !header.exists,
      'data-track-id': trackId,
      'data-track-locked': String(header.locked),
      onClick: () => {
        header.toggleLock();
      },
    }),
    [header, trackId]
  );

  return useMemo(
    () => ({
      trackId,
      exists: header.exists,
      label: header.label,
      locked: header.locked,
      setLocked,
      toggleLock,
      buttonProps,
    }),
    [buttonProps, header.exists, header.label, header.locked, setLocked, toggleLock, trackId]
  );
}
