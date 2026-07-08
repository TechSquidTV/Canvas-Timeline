import type { ActiveLayerOptions, ActiveLayerResult } from '@techsquidtv/canvas-timeline-core';
import { useMemo } from 'react';
import { useTimeline } from '#react/hooks/core/useTimeline';
import { useTimelinePlayheadTime } from '#react/hooks/playback/useTimelinePlayheadTime';

/**
 * Returns active timeline layers at a timeline time.
 *
 * @remarks
 *
 * The hook is collection-first: each named layer returns every matching active
 * clip in stable track order. `primary` is only a convenience first match.
 * Use it for preview panels, custom media status, subtitle overlays, and
 * diagnostics that need to inspect which timeline clips are active without
 * starting playback. For transport controls that drive an external media clock,
 * compose {@link useTimelineMediaSync} or {@link useTimelineMediaPlayback}
 * instead.
 *
 * @param options - Active layer selectors and optional lookup time.
 * @template LayerName - Named layer keys inferred from `options.layers`, such
 * as `"visuals" | "audio"`.
 * @returns Active clips grouped by the configured layer selectors.
 *
 * @example
 * ```tsx
 * import { useMemo } from 'react';
 * import { useActiveLayers } from '#react/hooks';
 *
 * const previewLayers = {
 *   visuals: { trackKind: 'visual' },
 *   audio: { trackKind: 'audio' },
 * } as const;
 *
 * export function ActiveMediaReadout() {
 *   const layers = useMemo(() => previewLayers, []);
 *   const activeLayers = useActiveLayers({ layers });
 *
 *   return (
 *     <dl>
 *       <dt>Visual</dt>
 *       <dd>{activeLayers.primary.visuals?.clip.name ?? 'No visual clip'}</dd>
 *       <dt>Audio clips</dt>
 *       <dd>{activeLayers.layers.audio.length}</dd>
 *     </dl>
 *   );
 * }
 * ```
 *
 * @see {@link ActiveLayerOptions}
 * @see {@link ActiveLayerResult}
 * @see {@link useTimelineMediaSync}
 * @see {@link https://canvastimeline.com/docs/react-hooks | React editor hooks}
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
