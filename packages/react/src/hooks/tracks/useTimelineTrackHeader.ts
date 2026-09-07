import { useTimelineTrack } from '#react/hooks/tracks/useTimelineTrack';
import type { UseTimelineTrackResult } from '#react/hooks/tracks/useTimelineTrack';
import type { TimelineTrackGeometryOptions } from '@techsquidtv/canvas-timeline-core';
import { useMemo } from 'react';
import type { HTMLAttributes } from 'react';
/**
 * DOM props returned for a track header row.
 *
 * @remarks
 *
 * These props provide semantic grouping, track data attributes, disabled state,
 * and renderer-aligned height. Spread them onto the outer header row before
 * layering app-specific buttons or labels inside.
 */
export type TimelineTrackHeaderRootProps = HTMLAttributes<HTMLDivElement>;

/**
 * Result returned by `useTimelineTrackHeader`.
 *
 * @remarks
 *
 * This result extends {@link UseTimelineTrackResult} with a computed display
 * label and DOM root props. It is the hook behind `Timeline.TrackHeader` and is
 * useful when building custom shadcn-like header rows.
 *
 */
export interface UseTimelineTrackHeaderResult extends UseTimelineTrackResult {
  /** Human-readable label for the header row. */
  label: string;
  /** Props for the root track header row element. */
  rootProps: TimelineTrackHeaderRootProps;
}

/**
 * Adapts one timeline track into DOM-ready track header state.
 *
 * @remarks
 *
 * Use this hook for custom track header columns that should remain aligned with
 * canvas row geometry. It reads row state from {@link useTimelineTrack}, derives
 * a stable label, and returns root props with data attributes for styling
 * selected, muted, locked, visible, targeted, and collapsed states.
 *
 * @param trackId - Track id to bind.
 * @param options - Optional track geometry overrides matching the renderer.
 * @returns Track row state plus header label and root DOM props.
 *
 * @example
 * ```tsx
 * import { useTimelineTrackHeader } from '@techsquidtv/canvas-timeline-react';
 *
 * export function CustomTrackHeader({ trackId }: { trackId: string }) {
 *   const header = useTimelineTrackHeader(trackId);
 *
 *   return (
 *     <div {...header.rootProps}>
 *       <span>{header.label}</span>
 *       <button type="button" aria-pressed={header.locked} onClick={() => header.toggleLock()}>
 *         Lock
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 *
 * @see {@link useTimelineTrack}
 * @see {@link https://canvastimeline.com/demos/timeline-editor-controls | Timeline editor controls demo}
 */
export function useTimelineTrackHeader(
  trackId: string,
  options: TimelineTrackGeometryOptions = {}
): UseTimelineTrackHeaderResult {
  const trackState = useTimelineTrack(trackId, options);
  const label = useMemo(
    () =>
      trackState.exists
        ? (trackState.name ?? `${trackState.kind ?? 'Track'} ${trackState.trackIndex + 1}`)
        : trackId,
    [trackId, trackState.exists, trackState.kind, trackState.name, trackState.trackIndex]
  );

  const rootProps = useMemo<TimelineTrackHeaderRootProps>(
    () => ({
      role: 'group',
      'aria-label': label,
      'aria-disabled': trackState.locked || undefined,
      'data-track-id': trackId,
      'data-track-kind': trackState.kind ?? undefined,
      'data-track-visible': String(trackState.visible),
      'data-track-muted': String(trackState.muted),
      'data-track-locked': String(trackState.locked),
      'data-track-selected': String(trackState.selected),
      'data-track-targeted': String(trackState.targeted),
      'data-track-collapsed': String(trackState.collapsed),
      style: {
        height: `${trackState.height}px`,
      },
    }),
    [
      label,
      trackId,
      trackState.collapsed,
      trackState.height,
      trackState.kind,
      trackState.locked,
      trackState.muted,
      trackState.selected,
      trackState.targeted,
      trackState.visible,
    ]
  );

  return useMemo(
    () => ({
      ...trackState,
      label,
      rootProps,
    }),
    [label, rootProps, trackState]
  );
}
