import { useCallback, useMemo } from 'react';
import type {
  TimelineEditImpact,
  TimelineEditImpacts,
  TimelineEditOperation,
  TimelineEngine,
} from '@techsquidtv/canvas-timeline-core';
import { useTimelineExternalStore } from '../core/useTimelineExternalStore';

const emptyTimelineEditImpacts: readonly TimelineEditImpact[] = Object.freeze([]);
const editImpactEvents = ['edit:impacts', 'state:settled'] as const;
const getTimelineEditImpacts = (engine: TimelineEngine) => engine.getEditImpacts();

/** Result returned by `useTimelineEditImpacts`. */
export interface UseTimelineEditImpactsResult {
  /** Active edit impacts for the current live edit interaction, or null when none are active. */
  activeEdit: TimelineEditImpacts | null;
  /** Clip-level consequences for the current live edit interaction. */
  impacts: readonly TimelineEditImpact[];
  /** Current live edit operation, or null when no edit impacts are active. */
  operation: TimelineEditOperation | null;
  /** Clip currently driving the active edit, or null when no edit impacts are active. */
  sourceClipId: string | null;
  /** Track containing the source clip, or null when no edit impacts are active. */
  sourceTrackId: string | null;
  /** Whether the active edit currently affects any other clips. */
  hasImpacts: boolean;
  /** Returns the active edit impact for one affected clip. */
  getImpactForClip: (clipId: string) => TimelineEditImpact | null;
}

/**
 * Subscribes to live edit impacts produced by active timeline interactions.
 *
 * This is a live interaction hook: it can update during drag and trim gestures.
 * Use it for custom headless UI affordances that show which clips are trimmed,
 * split, or removed by the active edit.
 *
 * @returns Current edit impacts and helpers for custom editor UI.
 */
export function useTimelineEditImpacts(): UseTimelineEditImpactsResult {
  const activeEdit = useTimelineExternalStore(editImpactEvents, getTimelineEditImpacts);

  const impacts = useMemo(() => activeEdit?.impacts ?? emptyTimelineEditImpacts, [activeEdit]);
  const impactByClipId = useMemo(() => {
    const lookup = new Map<string, TimelineEditImpact>();
    for (const impact of impacts) {
      lookup.set(impact.clipId, impact);
    }
    return lookup;
  }, [impacts]);
  const getImpactForClip = useCallback(
    (clipId: string) => impactByClipId.get(clipId) ?? null,
    [impactByClipId]
  );

  return {
    activeEdit,
    impacts,
    operation: activeEdit?.operation ?? null,
    sourceClipId: activeEdit?.sourceClipId ?? null,
    sourceTrackId: activeEdit?.sourceTrackId ?? null,
    hasImpacts: impacts.length > 0,
    getImpactForClip,
  };
}
