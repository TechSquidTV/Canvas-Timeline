import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import type {
  EngineEventMap,
  TimelineEngine,
  TimelineState,
} from '@techsquidtv/canvas-timeline-core';
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
type Store = ReturnType<typeof createStore>;
const stores = new WeakMap<TimelineEngine, Store>();
const events: readonly (keyof EngineEventMap)[] = [
  'state:settled',
  'history:change',
  'state:inOut',
  'playback:state',
  'playback:rate',
  'content:change',
  'clip:select',
  'keyframe:select',
  'snap:change',
  'track:select',
];
function createStore(engine: TimelineEngine) {
  let engineSnapshot = engine.getState();
  let snapshot = structuredClone(engineSnapshot) as TimelineState;
  const listeners = new Set<() => void>();
  let unsubscribe: (() => void)[] = [];
  const update = () => {
    const state = engine.getState();
    snapshot = {
      ...state,
      snapFeedback:
        state.snapFeedback === engineSnapshot.snapFeedback
          ? snapshot.snapFeedback
          : (structuredClone(state.snapFeedback) as TimelineState['snapFeedback']),
      clipDropFeedback:
        state.clipDropFeedback === engineSnapshot.clipDropFeedback
          ? snapshot.clipDropFeedback
          : { ...state.clipDropFeedback },
      tracks:
        state.tracks !== engineSnapshot.tracks
          ? (structuredClone(state.tracks) as TimelineState['tracks'])
          : snapshot.tracks,
      markers:
        state.markers !== engineSnapshot.markers
          ? (structuredClone(state.markers) as TimelineState['markers'])
          : snapshot.markers,
      clipGroups:
        state.clipGroups !== engineSnapshot.clipGroups
          ? (structuredClone(state.clipGroups) as TimelineState['clipGroups'])
          : snapshot.clipGroups,
    };
    engineSnapshot = state;
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      if (listeners.size === 0) {
        unsubscribe = events.map((event) => engine.on(event, update));
        update();
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          unsubscribe.forEach((dispose) => dispose());
        }
      };
    },
  };
}

/** Selects state fields with shallow equality and stable document collection identities. */
export function useTimelineSelector<Value extends object>(
  selector: (state: TimelineState) => Value
): Value {
  const engine = useTimelineEngine();
  const store = useMemo(() => {
    let result = stores.get(engine);
    if (!result) {
      result = createStore(engine);
      stores.set(engine, result);
    }
    return result;
  }, [engine]);
  const previous = useRef<Value | undefined>(undefined);
  const getSnapshot = useCallback(() => {
    const next = selector(store.getSnapshot());
    const last = previous.current;
    if (
      last &&
      Object.keys(next).length === Object.keys(last).length &&
      (Object.keys(next) as (keyof Value)[]).every((key) => Object.is(last[key], next[key]))
    ) {
      return last;
    }
    previous.current = next;
    return next;
  }, [selector, store]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
