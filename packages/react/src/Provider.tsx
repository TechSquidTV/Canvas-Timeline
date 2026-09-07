import { TimelineContext } from '#react/context';
import type { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import React from 'react';
/**
 * Props for wiring a {@link TimelineEngine} into React context.
 *
 * @remarks
 *
 * Pass one stable engine instance to {@link TimelineProvider}. Descendant hooks
 * such as {@link useTimeline} and {@link useTimelineState} read from this
 * context and receive synchronized `TimelineState` snapshots.
 *
 * @see {@link https://canvastimeline.com/docs/getting-started | Getting Started}
 * @see {@link https://canvastimeline.com/docs/react-hooks | React editor hooks}
 */
export interface TimelineProviderProps {
  /** React subtree that should read from the provided engine. */
  children?: React.ReactNode;
  /** Engine instance that owns timeline state and editing operations. */
  engine: TimelineEngine;
}

/**
 * Provides a {@link TimelineEngine} to React timeline hooks and components.
 *
 * @remarks
 *
 * `TimelineProvider` is the bridge between the event-driven engine model and
 * React layouts. It provides a stable engine reference; consuming hooks subscribe
 * to the state fields they need. Command-only consumers can use
 * {@link useTimelineEngine} without subscribing to state. Hooks such as {@link useTimeline} and
 * {@link useTimelineState} must run inside this provider.
 *
 * @param props - Provider configuration and child tree.
 *
 * @example
 * ```tsx
 * import { useMemo } from 'react';
 * import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
 * import {
 *   TimelineProvider,
 *   useTimelineState,
 * } from '@techsquidtv/canvas-timeline-react';
 * import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
 *
 * function TrackCount() {
 *   const state = useTimelineState();
 *
 *   return <span>{state.tracks.length} tracks</span>;
 * }
 *
 * export function EditorShell() {
 *   const engine = useMemo(
 *     () =>
 *       new TimelineEngine({
 *         duration: fromSeconds(30),
 *         tracks: [],
 *       }),
 *     []
 *   );
 *
 *   return (
 *     <TimelineProvider engine={engine}>
 *       <TrackCount />
 *     </TimelineProvider>
 *   );
 * }
 * ```
 *
 * @see {@link TimelineEngine}
 * @see `TimelineState`
 * @see {@link https://canvastimeline.com/docs/react-hooks | React editor hooks}
 */
export function TimelineProvider(props: TimelineProviderProps) {
  const { children, engine } = props;
  return <TimelineContext.Provider value={engine}>{children}</TimelineContext.Provider>;
}
