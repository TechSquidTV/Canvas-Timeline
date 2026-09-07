import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { useTimelineState } from '#react/hooks/core/useTimelineState';
import type { TimelineEngine, TimelineStateSnapshot } from '@techsquidtv/canvas-timeline-core';
/**
 * Engine and synchronized state returned by {@link useTimeline}.
 */
export interface UseTimelineResult {
  /** Shared engine instance that owns timeline state and commands. */
  engine: TimelineEngine;
  /** React-rendered snapshot of the current timeline state. */
  state: TimelineStateSnapshot;
}

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
 * the synchronized `TimelineStateSnapshot` snapshot.
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
export function useTimeline(): UseTimelineResult {
  return { engine: useTimelineEngine(), state: useTimelineState() };
}
