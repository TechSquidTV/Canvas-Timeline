import { useCallback, useMemo, useState } from 'react';
import type { TimelineEditMode } from '@techsquidtv/canvas-timeline-core';

/** Result returned by `useTimelineEditMode`. */
export interface UseTimelineEditModeResult {
  /** Current editor edit mode for product chrome. */
  mode: TimelineEditMode;
  /** Whether the selected mode is the default selection mode. */
  selecting: boolean;
  /** Updates the current edit mode. */
  setMode: (mode: TimelineEditMode) => void;
  /** Restores selection mode. */
  resetMode: () => void;
}

/**
 * Owns local edit-mode state for product toolbar chrome.
 *
 * The selected mode does not mutate engine state by itself. Compose it with
 * `useTimelineEditCommands` to build and preview typed edit commands.
 *
 * @param initialMode - Initial edit mode. Defaults to `select`.
 * @returns Current mode state and mode commands.
 */
export function useTimelineEditMode(
  initialMode: TimelineEditMode = 'select'
): UseTimelineEditModeResult {
  const [mode, setMode] = useState<TimelineEditMode>(initialMode);
  const resetMode = useCallback(() => {
    setMode('select');
  }, []);

  return useMemo(
    () => ({
      mode,
      selecting: mode === 'select',
      setMode,
      resetMode,
    }),
    [mode, resetMode]
  );
}
