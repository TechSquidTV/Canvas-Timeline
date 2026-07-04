import { useTimeline } from './useTimeline';

/**
 * Reads the current synchronized timeline state.
 *
 * This is a render-focused shortcut for components that need track, playhead,
 * zoom, scroll, marker, or playback state without calling engine methods. The
 * returned value updates when `TimelineProvider` receives engine state events.
 *
 * @returns The latest `TimelineState` snapshot published by `TimelineProvider`.
 *
 * @example
 * ```tsx
 * const state = useTimelineState();
 *
 * return <span>{state.tracks.length} tracks</span>;
 * ```
 */
export function useTimelineState() {
  return useTimeline().state;
}
