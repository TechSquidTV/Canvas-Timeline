import { flattenTimelineClips } from '#react/hooks/clips/timelineClipModel';
import type { TimelineClipEntry } from '#react/hooks/clips/timelineClipModel';
import type {
  TimelineCommandResult,
  Clip,
  TimelineReadonly,
  TimelineEngine,
} from '@techsquidtv/canvas-timeline-core';
import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { useTimelineSelector } from '#react/hooks/core/useTimelineSelector';
import { useMemo } from 'react';

/** Editable clip presentation fields; structural edits belong to `useTimelineEditCommands`. */
export type TimelineClipUpdate = Partial<Pick<Clip, 'label' | 'opacity' | 'color'>>;

/** Clip collection, lookup, edit capabilities, and presentation commands. */
export interface UseTimelineClipsResult {
  /** Flattened clips in timeline track order. */
  clips: TimelineReadonly<TimelineClipEntry>[];
  /** Looks up a clip and its containing track in current engine state. */
  getClip: TimelineEngine['geometry']['getClip'];
  /** Whether the clip and its track allow movement. */
  canMoveClip: (clipId: string) => boolean;
  /** Whether the clip and its track allow trimming. */
  canTrimClip: (clipId: string) => boolean;
  /** Whether the clip and its track allow source slipping. */
  canSlipClip: (clipId: string) => boolean;
  /** Whether the clip and its track allow sliding. */
  canSlideClip: (clipId: string) => boolean;
  /** Updates clip presentation through the engine's validated command API. */
  updateClip: (clipId: string, properties: TimelineClipUpdate) => TimelineCommandResult;
}

/**
 * Reads clip collection state without subscribing to viewport or playback updates.
 *
 * Compose `useTimelineSelection` for selection, geometry hooks for reactive rectangles,
 * and `useTimelineEngine().media` for imperative source-time mapping.
 * @returns Clip entries, current lookups, capabilities, and presentation commands.
 * @example
 * ```tsx
 * import { useTimelineClips, useTimelineSelection } from '@techsquidtv/canvas-timeline-react';
 * export function ClipLabelEditor() {
 *   const { selectedClip } = useTimelineSelection();
 *   const { updateClip } = useTimelineClips();
 *   return selectedClip ? <input value={selectedClip.label ?? ''}
 *     onChange={event => updateClip(selectedClip.id, { label: event.target.value })} /> : null;
 * }
 * ```
 */
export function useTimelineClips(): UseTimelineClipsResult {
  const engine = useTimelineEngine();
  const tracks = useTimelineSelector((state) => state.tracks, Object.is);
  const clips = useMemo(() => flattenTimelineClips(tracks), [tracks]);
  const commands = useMemo(() => {
    const canEdit = (clipId: string, capability: 'movable' | 'resizable') => {
      const entry = engine.geometry.getClip(clipId);
      return Boolean(entry && !entry.track.locked && entry.clip[capability] !== false);
    };
    return {
      getClip: engine.geometry.getClip.bind(engine.geometry),
      canMoveClip: (clipId: string) => canEdit(clipId, 'movable'),
      canTrimClip: (clipId: string) => canEdit(clipId, 'resizable'),
      canSlipClip: (clipId: string) => canEdit(clipId, 'resizable'),
      canSlideClip: (clipId: string) => canEdit(clipId, 'movable'),
      updateClip: (clipId: string, properties: TimelineClipUpdate) =>
        engine.updateClipProperties(clipId, properties),
    };
  }, [engine]);
  return useMemo(() => ({ clips, ...commands }), [clips, commands]);
}
