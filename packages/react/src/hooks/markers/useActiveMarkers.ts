import type { Marker } from '@techsquidtv/canvas-timeline-core';
import { compareRational, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { useMemo } from 'react';
import { useTimeline } from '../core/useTimeline';
import { useTimelinePlayheadTime } from '../playback/useTimelinePlayheadTime';

/** Result returned by `useActiveMarkers`. */
export interface UseActiveMarkersResult {
  /** Marker exactly at the playhead, or null when none is active. */
  activeMarker: Marker | null;
  /** Marker nearest to the playhead, or null when no markers exist. */
  nearestMarker: Marker | null;
  /** Next marker after the playhead, or null when none exists. */
  nextMarker: Marker | null;
  /** Previous marker before the playhead, or null when none exists. */
  previousMarker: Marker | null;
}

/**
 * Subscribes to live marker proximity derived from the current playhead.
 *
 * Use this focused live hook for readouts and marker navigation UI that should
 * update during playback or scrubbing. Use `useTimelineMarkers` for ordinary
 * marker lists and marker editing commands.
 *
 * @returns Active, nearest, previous, and next markers for the live playhead time.
 */
export function useActiveMarkers(): UseActiveMarkersResult {
  const { state } = useTimeline();
  const playheadTime = useTimelinePlayheadTime();
  const markers = useMemo(
    () => [...(state.markers || [])].sort((left, right) => compareRational(left.time, right.time)),
    [state.markers]
  );

  return useMemo(() => {
    const activeMarker =
      markers.find((marker) => compareRational(marker.time, playheadTime) === 0) ?? null;
    const previousMarker =
      [...markers].reverse().find((marker) => compareRational(marker.time, playheadTime) < 0) ??
      null;
    const nextMarker =
      markers.find((marker) => compareRational(marker.time, playheadTime) > 0) ?? null;
    const nearestMarker =
      markers.reduce<Marker | null>((nearest, marker) => {
        if (!nearest) {
          return marker;
        }
        const markerDistance = Math.abs(toSeconds(marker.time) - toSeconds(playheadTime));
        const nearestDistance = Math.abs(toSeconds(nearest.time) - toSeconds(playheadTime));
        return markerDistance < nearestDistance ? marker : nearest;
      }, null) ?? null;

    return {
      activeMarker,
      nearestMarker,
      nextMarker,
      previousMarker,
    };
  }, [markers, playheadTime]);
}
