import React, { useEffect, useState } from 'react';
import type { TimelineEngine, TimelineState } from '@techsquidtv/canvas-timeline-core';
import { TimelineContext } from '#react/context';

/**
 * Props for wiring a {@link TimelineEngine} into React context.
 *
 * @remarks
 *
 * Pass one stable engine instance to {@link TimelineProvider}. Descendant hooks
 * such as {@link useTimeline} and {@link useTimelineState} read from this
 * context and receive synchronized {@link TimelineState} snapshots.
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

function createProviderState(engine: TimelineEngine): TimelineState {
  const engineState = engine.getState();
  return {
    tracks: [...engine.tracks],
    clipGroups: [...engine.clipGroups],
    contentRevision: engine.contentRevision,
    playheadTime: engine.playheadTime,
    zoomScale: engine.zoomScale,
    scrollLeft: engine.scrollLeft,
    scrollTop: engine.scrollTop,
    snapEnabled: engineState.snapEnabled,
    snapThresholdPixels: engineState.snapThresholdPixels,
    snapFeedback: {
      lines: [...engineState.snapFeedback.lines],
      target: engineState.snapFeedback.target,
    },
    clipDropFeedback: {
      ...engineState.clipDropFeedback,
    },
    inPoint: engineState.inPoint,
    outPoint: engineState.outPoint,
    markers: engineState.markers ? [...engineState.markers] : [],
    viewportWidth: engineState.viewportWidth,
    viewportHeight: engineState.viewportHeight,
    playing: engineState.playing,
    playbackRate: engineState.playbackRate,
    duration: engineState.duration,
  };
}

/**
 * Provides a {@link TimelineEngine} to React timeline hooks and components.
 *
 * @remarks
 *
 * `TimelineProvider` is the bridge between the event-driven engine model and
 * React layouts. It subscribes to settled state, selection, playback, content,
 * and clipboard changes, then publishes lightweight {@link TimelineState}
 * snapshots to descendants. Hooks such as {@link useTimeline} and
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
 * @see {@link TimelineState}
 * @see {@link https://canvastimeline.com/docs/react-hooks | React editor hooks}
 */
export function TimelineProvider(props: TimelineProviderProps) {
  const { children, engine } = props;
  const [state, setState] = useState<TimelineState>(() => createProviderState(engine));

  useEffect(() => {
    const handleStateChange = () => {
      setState(createProviderState(engine));
    };

    handleStateChange();

    const unsubSettled = engine.on('state:settled', handleStateChange);
    const unsubHistory = engine.on('history:change', handleStateChange);
    const unsubInOut = engine.on('state:inOut', handleStateChange);
    const unsubPlaybackState = engine.on('playback:state', handleStateChange);
    const unsubPlaybackRate = engine.on('playback:rate', handleStateChange);
    const unsubContent = engine.on('content:change', handleStateChange);
    const unsubClipSelect = engine.on('clip:select', handleStateChange);
    const unsubKeyframeSelect = engine.on('keyframe:select', handleStateChange);
    const unsubClipboard = engine.on('clipboard:change', handleStateChange);
    const unsubSnap = engine.on('snap:change', handleStateChange);
    return () => {
      unsubSettled();
      unsubHistory();
      unsubInOut();
      unsubPlaybackState();
      unsubPlaybackRate();
      unsubContent();
      unsubClipSelect();
      unsubKeyframeSelect();
      unsubClipboard();
      unsubSnap();
    };
  }, [engine]);

  return <TimelineContext.Provider value={{ engine, state }}>{children}</TimelineContext.Provider>;
}
