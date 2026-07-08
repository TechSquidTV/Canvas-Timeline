import type { Marker } from '@techsquidtv/canvas-timeline-core';
import { compareRational, type RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useCallback, useMemo } from 'react';
import { useTimeline } from '#react/hooks/core/useTimeline';
import {
  timelineCommandFail,
  timelineCommandOk,
  type TimelineCommandResult,
} from '#react/hooks/core/timelineCommandResult';

/** Editable marker fields accepted by `useTimelineMarkers().updateMarker`. */
export type TimelineMarkerUpdate = Partial<
  Pick<Marker, 'time' | 'label' | 'color' | 'description'>
>;

/** Result returned by `useTimelineMarkers`. */
export interface UseTimelineMarkersResult {
  /** Current timeline markers sorted by time. */
  markers: Marker[];
  /** Adds a marker at a timeline time. */
  addMarker: (
    time: RationalTime,
    label?: string,
    color?: string,
    description?: string
  ) => TimelineCommandResult<Marker>;
  /** Adds a marker at the current playhead. */
  addMarkerAtPlayhead: (
    label?: string,
    color?: string,
    description?: string
  ) => TimelineCommandResult<Marker>;
  /** Removes a marker by id. */
  removeMarker: (id: string) => TimelineCommandResult;
  /** Updates marker metadata by id. */
  updateMarker: (id: string, updates: TimelineMarkerUpdate) => TimelineCommandResult<Marker>;
  /** Moves the playhead to a marker by id. */
  seekToMarker: (id: string) => TimelineCommandResult<Marker>;
  /** Moves the playhead to the next marker after the current playhead. */
  seekToNextMarker: () => TimelineCommandResult<Marker>;
  /** Moves the playhead to the previous marker before the current playhead. */
  seekToPreviousMarker: () => TimelineCommandResult<Marker>;
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
  const { engine, state } = useTimeline();
  const markers = useMemo(
    () => [...(state.markers || [])].sort((left, right) => compareRational(left.time, right.time)),
    [state.markers]
  );

  const findPreviousMarker = useCallback(
    (time: RationalTime) =>
      [...markers].reverse().find((marker) => compareRational(marker.time, time) < 0) ?? null,
    [markers]
  );

  const findNextMarker = useCallback(
    (time: RationalTime) =>
      markers.find((marker) => compareRational(marker.time, time) > 0) ?? null,
    [markers]
  );

  const addMarker = useCallback(
    (time: RationalTime, label?: string, color?: string, description?: string) => {
      const marker = engine.addMarker(time, label, color, description);
      return timelineCommandOk(marker);
    },
    [engine]
  );

  const addMarkerAtPlayhead = useCallback(
    (label?: string, color?: string, description?: string) => {
      const marker = engine.addMarker(engine.playheadTime, label, color, description);
      return timelineCommandOk(marker);
    },
    [engine]
  );

  const removeMarker = useCallback(
    (id: string) =>
      engine.removeMarker(id) ? timelineCommandOk() : timelineCommandFail('not-found'),
    [engine]
  );

  const updateMarker = useCallback(
    (id: string, updates: TimelineMarkerUpdate) => {
      const marker = engine.updateMarker(id, updates);
      return marker ? timelineCommandOk(marker) : timelineCommandFail<Marker>('not-found');
    },
    [engine]
  );

  const seekToMarker = useCallback(
    (id: string) => {
      const marker = markers.find((candidate) => candidate.id === id);
      if (!marker) {
        return timelineCommandFail<Marker>('not-found');
      }
      engine.updatePlayhead(marker.time);
      return timelineCommandOk(marker);
    },
    [engine, markers]
  );

  const seekToNextMarker = useCallback(() => {
    const nextMarker = findNextMarker(engine.playheadTime);
    if (!nextMarker) {
      return timelineCommandFail<Marker>('not-found');
    }
    engine.updatePlayhead(nextMarker.time);
    return timelineCommandOk(nextMarker);
  }, [engine, findNextMarker]);

  const seekToPreviousMarker = useCallback(() => {
    const previousMarker = findPreviousMarker(engine.playheadTime);
    if (!previousMarker) {
      return timelineCommandFail<Marker>('not-found');
    }
    engine.updatePlayhead(previousMarker.time);
    return timelineCommandOk(previousMarker);
  }, [engine, findPreviousMarker]);

  return useMemo(
    () => ({
      markers,
      addMarker,
      addMarkerAtPlayhead,
      removeMarker,
      updateMarker,
      seekToMarker,
      seekToNextMarker,
      seekToPreviousMarker,
    }),
    [
      addMarker,
      addMarkerAtPlayhead,
      markers,
      removeMarker,
      seekToMarker,
      seekToNextMarker,
      seekToPreviousMarker,
      updateMarker,
    ]
  );
}
