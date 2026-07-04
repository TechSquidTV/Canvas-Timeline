import type { TimelineTrackGeometryOptions } from '@techsquidtv/canvas-timeline-core';
import { useMemo, type HTMLAttributes } from 'react';
import { useTimelineTrack, type UseTimelineTrackResult } from './useTimelineTrack';

/** DOM props returned for a track header row. */
export type TimelineTrackHeaderRootProps = HTMLAttributes<HTMLDivElement>;

/** Result returned by `useTimelineTrackHeader`. */
export interface UseTimelineTrackHeaderResult<
  TrackKind extends string = string,
> extends UseTimelineTrackResult<TrackKind> {
  /** Human-readable label for the header row. */
  label: string;
  /** Props for the root track header row element. */
  rootProps: TimelineTrackHeaderRootProps;
}

/**
 * Adapts one timeline track into DOM-ready track header state.
 *
 * @param trackId - Track id to bind.
 * @param options - Optional track geometry overrides matching the renderer.
 */
export function useTimelineTrackHeader<TrackKind extends string = string>(
  trackId: string,
  options: TimelineTrackGeometryOptions = {}
): UseTimelineTrackHeaderResult<TrackKind> {
  const trackState = useTimelineTrack<TrackKind>(trackId, options);
  const label = useMemo(
    () =>
      trackState.exists
        ? (trackState.name ?? `${trackState.kind ?? 'Track'} ${trackState.trackIndex + 1}`)
        : trackId,
    [trackId, trackState.exists, trackState.kind, trackState.name, trackState.trackIndex]
  );

  const rootProps = useMemo<TimelineTrackHeaderRootProps>(
    () => ({
      role: 'row',
      'aria-label': label,
      'aria-selected': trackState.selected || undefined,
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
