import type { TimelineState } from '@techsquidtv/canvas-timeline-core';
import { useTimeline } from '#react/hooks/core/useTimeline';

/**
 * Reads the current synchronized {@link TimelineState} snapshot.
 *
 * @remarks
 *
 * Use `useTimelineState` for low-frequency product chrome that needs a broad
 * view of timeline content, viewport, playback, markers, or edit feedback
 * without calling engine methods. The returned snapshot updates when
 * {@link TimelineProvider} receives engine state events.
 *
 * Prefer narrower hooks when a component only needs one live value. For example,
 * use {@link useTimelinePlayheadTime} for playback readouts and
 * {@link useTimelineViewport} for viewport controls. See
 * {@link https://canvastimeline.com/docs/react-hooks | React editor hooks} for
 * the hook selection guide.
 *
 * @returns The latest `TimelineState` snapshot published by `TimelineProvider`.
 *
 * @example
 * ```tsx
 * import { useTimelineState } from '@techsquidtv/canvas-timeline-react';
 *
 * export function TimelineStatus() {
 *   const state = useTimelineState();
 *
 *   return (
 *     <dl>
 *       <dt>Tracks</dt>
 *       <dd>{state.tracks.length}</dd>
 *       <dt>Playback</dt>
 *       <dd>{state.playing ? 'Playing' : 'Paused'}</dd>
 *       <dt>Zoom</dt>
 *       <dd>{state.zoomScale}px/s</dd>
 *     </dl>
 *   );
 * }
 * ```
 *
 * @see {@link TimelineState}
 * @see {@link TimelineProvider}
 * @see {@link useTimelinePlayheadTime}
 * @see {@link useTimelineViewport}
 */
export function useTimelineState(): TimelineState {
  return useTimeline().state;
}
