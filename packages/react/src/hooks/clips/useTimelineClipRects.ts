import { useMemo } from 'react';
import type {
  TimelineClipGeometryOptions,
  TimelineClipRect,
} from '@techsquidtv/canvas-timeline-core';
import { useTimeline } from '#react/hooks/core/useTimeline';
import { useTimelineGeometryRevision } from '#react/hooks/core/useTimelineGeometryRevision';

/**
 * Options accepted by `useTimelineClipRects`.
 *
 * @remarks
 *
 * Pass the same ruler, track-height, and edge-threshold values used by your
 * renderer or interaction layer so DOM overlays line up with canvas-painted
 * clips. Leave options empty when using the default package geometry.
 *
 * @see {@link https://canvastimeline.com/docs/renderer-customization | Canvas renderer customization}
 */
export type UseTimelineClipRectsOptions = TimelineClipGeometryOptions;

/**
 * Returns viewport-space geometry for every timeline clip.
 *
 * @remarks
 *
 * The hook subscribes to geometry-affecting timeline events and intentionally
 * does not subscribe to playhead-only updates. Use it for low-count DOM
 * overlays such as selected clip outlines, inline labels, or inspector hit
 * targets. For large custom renderers, prefer {@link useTimelineVisibleClips}
 * so offscreen clips are clipped or skipped.
 *
 * @param options - Optional ruler and track metrics aligned with the renderer.
 * @returns Clip entries with viewport rectangles and edit/display state.
 * @template TrackKind - App-defined track kind values carried by returned track
 * entries.
 *
 * @example
 * ```tsx
 * import { useTimelineClipRects } from '#react/hooks';
 *
 * export function SelectedClipBadges() {
 *   const rects = useTimelineClipRects();
 *
 *   return rects
 *     .filter((entry) => entry.selected)
 *     .map((entry) => (
 *       <span
 *         key={entry.clipId}
 *         style={{ left: entry.x, top: entry.y, width: entry.width, height: entry.height }}
 *       >
 *         {entry.clip.label ?? entry.clip.id}
 *       </span>
 *     ));
 * }
 * ```
 *
 * @see {@link useTimelineVisibleClips}
 * @see {@link https://canvastimeline.com/docs/react-hooks | React editor hooks}
 */
export function useTimelineClipRects<TrackKind = string>(
  options: UseTimelineClipRectsOptions = {}
): TimelineClipRect<TrackKind>[] {
  const { engine } = useTimeline();
  const revision = useTimelineGeometryRevision();
  const { collapsedTrackHeight, edgeThreshold, rulerHeight, touchEdgeThreshold, trackHeight } =
    options;

  return useMemo(() => {
    void revision;
    return engine.getClipRects<TrackKind>({
      collapsedTrackHeight,
      edgeThreshold,
      rulerHeight,
      touchEdgeThreshold,
      trackHeight,
    });
  }, [
    collapsedTrackHeight,
    edgeThreshold,
    engine,
    revision,
    rulerHeight,
    touchEdgeThreshold,
    trackHeight,
  ]);
}
