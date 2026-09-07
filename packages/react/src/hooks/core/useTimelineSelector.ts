import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import type {
  EngineEventMap,
  TimelineEngine,
  TimelineStateSnapshot,
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
  let snapshot = engine.getState();
  const listeners = new Set<() => void>();
  let unsubscribe: (() => void)[] = [];
  const update = () => {
    const next = engine.getState();
    if (next === snapshot) {
      return;
    }
    snapshot = next;
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

function shallowEqual<Value>(previous: Value, next: Value): boolean {
  if (Object.is(previous, next)) {
    return true;
  }
  if (
    typeof previous !== 'object' ||
    previous === null ||
    typeof next !== 'object' ||
    next === null
  ) {
    return false;
  }
  if (Object.getPrototypeOf(previous) !== Object.getPrototypeOf(next)) {
    return false;
  }
  if (!Array.isArray(next) && Object.getPrototypeOf(next) !== Object.prototype) {
    return false;
  }
  if (Array.isArray(previous) && Array.isArray(next) && previous.length !== next.length) {
    return false;
  }
  const keys = Object.keys(next) as (keyof Value)[];
  return (
    keys.length === Object.keys(previous).length &&
    keys.every((key) => Object.hasOwn(previous, key) && Object.is(previous[key], next[key]))
  );
}

/**
 * Selects a value from the engine's immutable, settled state snapshot.
 *
 * @remarks
 * Primitive results use Object.is; arrays and plain objects compare their own
 * enumerable fields shallowly. Supply isEqual for another selection policy.
 * This hook excludes per-frame playback and edit-preview updates. Use
 * {@link useTimelinePlayheadTime} for a live playback readout.
 *
 * @param selector - Pure projection of the readonly timeline snapshot.
 * @param isEqual - Equality check used to preserve the last selected value.
 * @template Value - Selected value, including primitive values.
 * @returns The selected value, updated only when its equality check changes.
 * @example
 * ```tsx
 * import { useTimelineSelector } from '@techsquidtv/canvas-timeline-react';
 * export function TrackCount() {
 *   const count = useTimelineSelector(state => state.tracks.length);
 *   return <output>{count}</output>;
 * }
 * ```
 */
export function useTimelineSelector<Value>(
  selector: (state: TimelineStateSnapshot) => Value,
  isEqual: (previous: Value, next: Value) => boolean = shallowEqual
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
  const previous = useRef<{ value: Value } | undefined>(undefined);
  const getSnapshot = useCallback(() => {
    const next = selector(store.getSnapshot());
    if (previous.current && isEqual(previous.current.value, next)) {
      return previous.current.value;
    }
    previous.current = { value: next };
    return next;
  }, [selector, store, isEqual]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
