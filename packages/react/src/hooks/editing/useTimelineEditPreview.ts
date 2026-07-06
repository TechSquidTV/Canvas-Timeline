import { useMemo } from 'react';
import type { TimelineEditPreview, TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { useTimelineExternalStore } from '../core/useTimelineExternalStore';

const editPreviewEvents = ['edit:preview', 'state:settled'] as const;
const getTimelineEditPreview = (engine: TimelineEngine) => engine.getEditPreview();

/** Result returned by `useTimelineEditPreview`. */
export interface UseTimelineEditPreviewResult {
  /** Active command-layer edit preview, or null when no preview is active. */
  preview: TimelineEditPreview | null;
  /** Whether the current preview can be committed. */
  valid: boolean;
  /** Whether an edit preview is currently active. */
  previewing: boolean;
}

/**
 * Subscribes to live command-layer edit preview state.
 *
 * This is a focused live hook for preview validity and command state. Compose
 * with `useTimelineEditImpacts` when UI also needs affected-clip consequences.
 *
 * @returns Active edit preview state.
 */
export function useTimelineEditPreview(): UseTimelineEditPreviewResult {
  const preview = useTimelineExternalStore(editPreviewEvents, getTimelineEditPreview);

  return useMemo(
    () => ({
      preview,
      valid: preview?.valid ?? false,
      previewing: preview !== null,
    }),
    [preview]
  );
}
