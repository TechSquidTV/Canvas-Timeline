import { useMemo } from 'react';
import type {
  VisibleTimelineClip,
  VisibleTimelineClipOptions,
} from '@techsquidtv/canvas-timeline-core';
import { useTimeline } from '#react/hooks/core/useTimeline';
import { useTimelineGeometryRevision } from '#react/hooks/core/useTimelineGeometryRevision';

/**
 * Options accepted by `useTimelineVisibleClips`.
 *
 * @remarks
 *
 * Use viewport dimensions and `overscanPixels` to trade precision for render
 * stability while scrolling. Pass renderer-aligned geometry when custom DOM or
 * canvas layers must line up with `CanvasRenderer`.
 *
 * @see {@link https://canvastimeline.com/demos/react-dom-timeline | React DOM timeline demo}
 */
export type UseTimelineVisibleClipsOptions = VisibleTimelineClipOptions;

/**
 * Returns viewport-intersecting timeline clips with clipped time/source ranges.
 *
 * @remarks
 *
 * This is the preferred hook for custom DOM clip renderers and custom canvas
 * layers that only need visible or near-visible clips. Each returned entry
 * includes the visible viewport rectangle plus clipped timeline/source ranges,
 * so thumbnail, waveform, and annotation renderers can avoid work for hidden
 * portions of long clips.
 *
 * @param options - Viewport, overscan, and optional renderer-aligned geometry settings.
 * @returns Visible clip entries in track order.
 * @template TrackKind - App-defined track kind values carried by returned track
 * entries.
 *
 * @example
 * ```tsx
 * import { useTimelineVisibleClips } from '#react/hooks';
 *
 * export function VisibleClipList() {
 *   const visibleClips = useTimelineVisibleClips({ overscanPixels: 160 });
 *
 *   return (
 *     <ul>
 *       {visibleClips.map((entry) => (
 *         <li key={entry.clip.id}>{entry.clip.label ?? entry.clip.id}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 *
 * @see {@link useTimelineClipRects}
 * @see {@link https://canvastimeline.com/docs/renderer-customization | Canvas renderer customization}
 */
export function useTimelineVisibleClips<TrackKind = string>(
  options: UseTimelineVisibleClipsOptions = {}
): VisibleTimelineClip<TrackKind>[] {
  const { engine } = useTimeline();
  const revision = useTimelineGeometryRevision();
  const {
    collapsedTrackHeight,
    edgeThreshold,
    overscanPixels,
    rulerHeight,
    touchEdgeThreshold,
    trackHeight,
    viewportHeight,
    viewportWidth,
  } = options;

  return useMemo(() => {
    void revision;
    return engine.getVisibleTimelineClips<TrackKind>({
      collapsedTrackHeight,
      edgeThreshold,
      overscanPixels,
      rulerHeight,
      touchEdgeThreshold,
      trackHeight,
      viewportHeight,
      viewportWidth,
    });
  }, [
    collapsedTrackHeight,
    edgeThreshold,
    engine,
    overscanPixels,
    revision,
    rulerHeight,
    touchEdgeThreshold,
    trackHeight,
    viewportHeight,
    viewportWidth,
  ]);
}
