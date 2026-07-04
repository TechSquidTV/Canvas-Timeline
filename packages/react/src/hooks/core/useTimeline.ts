import { useContext } from 'react';
import { TimelineContext } from '../../context';

/**
 * Reads the timeline engine and synchronized state from React context.
 *
 * Use this hook inside components wrapped by `TimelineProvider` when you need to
 * call imperative engine commands and read the latest React-rendered state in
 * the same component. Prefer narrower hooks such as `useTimelineState`,
 * `useTimelinePlayback`, or `useTimelineClips` when a component only needs one
 * slice of timeline behavior.
 *
 * @returns Timeline context containing the shared `TimelineEngine` instance and
 * the synchronized `TimelineState` snapshot.
 *
 * @throws Error when called outside of `TimelineProvider`.
 *
 * @example
 * ```tsx
 * const { engine, state } = useTimeline();
 *
 * return (
 *   <button onClick={() => engine.updatePlayhead(state.playheadTime)}>
 *     Refresh playhead
 *   </button>
 * );
 * ```
 */
export function useTimeline() {
  const ctx = useContext(TimelineContext);
  if (!ctx) {
    throw new Error('useTimeline must be used within TimelineProvider');
  }
  return ctx;
}
