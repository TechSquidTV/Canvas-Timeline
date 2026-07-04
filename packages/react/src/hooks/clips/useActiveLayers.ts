import type { ActiveLayerOptions, ActiveLayerResult } from '@techsquidtv/canvas-timeline-core';
import { useMemo } from 'react';
import { useTimeline } from '../core/useTimeline';
import { useTimelinePlayheadTime } from '../playback/useTimelinePlayheadTime';

/**
 * Returns active timeline layers at a timeline time.
 *
 * The hook is collection-first: each named layer returns every matching active
 * clip in stable track order. `primary` is only a convenience first match.
 *
 * @param options - Active layer selectors and optional lookup time.
 */
export function useActiveLayers<LayerName extends string = string>(
  options: ActiveLayerOptions<LayerName>
): ActiveLayerResult<LayerName> {
  const timeline = useTimeline();
  const playheadTime = useTimelinePlayheadTime();

  // Keep the revision in this snapshot so memoized lookups refresh when clips move under a fixed time.
  const lookupSnapshot = useMemo(
    () => ({
      layers: options.layers,
      revision: timeline.state.contentRevision,
      time: options.time ?? playheadTime,
    }),
    [options.layers, options.time, timeline.state.contentRevision, playheadTime]
  );

  return useMemo(() => {
    return timeline.engine.getActiveLayers({
      layers: lookupSnapshot.layers,
      time: lookupSnapshot.time,
    });
  }, [lookupSnapshot, timeline.engine]);
}
