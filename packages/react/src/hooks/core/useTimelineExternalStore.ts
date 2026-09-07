import { shallowEqual } from '#react/hooks/core/timelineSnapshotEqual';
import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import type { EngineEventMap, TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { useCallback, useRef, useSyncExternalStore } from 'react';
type TimelineExternalStoreEvent = keyof EngineEventMap;
type TimelineExternalStoreSnapshot<T> = (engine: TimelineEngine) => T;

/**
 * Subscribes to TimelineEngine events with stable React external-store callbacks.
 */
export function useTimelineExternalStore<T>(
  events: readonly TimelineExternalStoreEvent[],
  getSnapshotForEngine: TimelineExternalStoreSnapshot<T>,
  isEqual: (previous: T, next: T) => boolean = shallowEqual
): T {
  const engine = useTimelineEngine();
  const previous = useRef<{ engine: TimelineEngine; value: T } | undefined>(undefined);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const unsubscribe = events.map((eventName) => engine.on(eventName, onStoreChange));
      return () => {
        for (const unsubscribeEvent of unsubscribe) {
          unsubscribeEvent();
        }
      };
    },
    [engine, events]
  );

  const getSnapshot = useCallback(() => {
    const next = getSnapshotForEngine(engine);
    if (previous.current?.engine === engine && isEqual(previous.current.value, next)) {
      return previous.current.value;
    }
    previous.current = { engine, value: next };
    return next;
  }, [engine, getSnapshotForEngine, isEqual]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
