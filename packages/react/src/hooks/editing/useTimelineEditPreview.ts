import { useMemo } from 'react';
import type {
  TimelineEditImpact,
  TimelineEditPreview,
  TimelineEngine,
} from '@techsquidtv/canvas-timeline-core';
import { useTimelineExternalStore } from '../core/useTimelineExternalStore';

const emptyTimelineEditPreviewImpacts: readonly TimelineEditImpact[] = Object.freeze([]);
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
  /** Clip-level consequences for renderer and custom UI affordances. */
  impacts: readonly TimelineEditImpact[];
}

/**
 * Subscribes to live command-layer edit previews.
 *
 * This is a focused live hook. It updates when command previews change and does
 * not broaden provider state with drag-time edit consequences.
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
      impacts: preview?.impacts ?? emptyTimelineEditPreviewImpacts,
    }),
    [preview]
  );
}
