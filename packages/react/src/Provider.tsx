import React, { useEffect, useState } from 'react';
import type { TimelineEngine, TimelineState } from '@techsquidtv/canvas-timeline-core';
import { TimelineContext } from './context';

/**
 * Props for wiring a TimelineEngine into React context.
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
 * TimelineProvider
 *
 * Sets up a bridge between the central event-driven `TimelineEngine` model
 * and standard React functional layouts. Subscribes to settled state,
 * selection, playback, content, and clipboard changes, pushing lightweight state
 * updates downwards into hooks.
 *
 * @param props - Provider configuration and child tree.
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
