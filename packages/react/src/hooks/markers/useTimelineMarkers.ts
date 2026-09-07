import type {
  TimelineCommandResult,
  Marker,
  TimelineReadonly,
} from '@techsquidtv/canvas-timeline-core';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { useTimelineSelector } from '#react/hooks/core/useTimelineSelector';
import {
  createTimelineMarkersCommands,
  sortTimelineMarkers,
} from '#react/hooks/markers/createTimelineMarkersCommands';
import { useMemo } from 'react';
/** Editable marker fields accepted by `useTimelineMarkers().updateMarker`. */
export type TimelineMarkerUpdate = Partial<
  Pick<Marker, 'time' | 'label' | 'color' | 'description'>
>;

/** Result returned by `useTimelineMarkers`. */
export interface UseTimelineMarkersResult {
  /** Current timeline markers sorted by time. */
  markers: readonly TimelineReadonly<Marker>[];
  /** Adds a marker at a timeline time. */
  addMarker: (
    time: RationalTime,
    label?: string,
    color?: string,
    description?: string
  ) => TimelineCommandResult<TimelineReadonly<Marker>>;
  /** Adds a marker at the current playhead. */
  addMarkerAtPlayhead: (
    label?: string,
    color?: string,
    description?: string
  ) => TimelineCommandResult<TimelineReadonly<Marker>>;
  /** Removes a marker by id. */
  removeMarker: (id: string) => TimelineCommandResult;
  /** Updates marker metadata by id. */
  updateMarker: (
    id: string,
    updates: TimelineMarkerUpdate
  ) => TimelineCommandResult<TimelineReadonly<Marker>>;
  /** Moves the playhead to a marker by id. */
  seekToMarker: (id: string) => TimelineCommandResult<TimelineReadonly<Marker>>;
  /** Moves the playhead to the next marker after the current playhead. */
  seekToNextMarker: () => TimelineCommandResult<TimelineReadonly<Marker>>;
  /** Moves the playhead to the previous marker before the current playhead. */
  seekToPreviousMarker: () => TimelineCommandResult<TimelineReadonly<Marker>>;
}

/**
 * Accesses and manages bookmark/annotation pins (markers).
 *
 * This canonical marker hook does not subscribe to live playhead ticks. Compose
 * it with `useActiveMarkers` when UI needs marker proximity at the current
 * playhead.
 *
 * @returns Sorted marker state and commands for adding, removing, updating, and seeking markers.
 */
export function useTimelineMarkers(): UseTimelineMarkersResult {
  const engine = useTimelineEngine();
  const state = useTimelineSelector((state) => state.markers, Object.is);
  const markers = useMemo(() => sortTimelineMarkers(state), [state]);
  const commands = useMemo(() => createTimelineMarkersCommands(engine), [engine]);
  return useMemo(() => ({ markers, ...commands }), [markers, commands]);
}
