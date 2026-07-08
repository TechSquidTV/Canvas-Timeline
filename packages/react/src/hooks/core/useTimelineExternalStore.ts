import { useCallback, useSyncExternalStore } from 'react';
import type { EngineEventMap, TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { useTimeline } from '#react/hooks/core/useTimeline';

type TimelineExternalStoreEvent = keyof EngineEventMap;
type TimelineExternalStoreSnapshot<T> = (engine: TimelineEngine) => T;

/**
 * Subscribes to TimelineEngine events with stable React external-store callbacks.
 */
export function useTimelineExternalStore<T>(
  events: readonly TimelineExternalStoreEvent[],
  getSnapshotForEngine: TimelineExternalStoreSnapshot<T>
): T {
  const { engine } = useTimeline();

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

  const getSnapshot = useCallback(
    () => getSnapshotForEngine(engine),
    [engine, getSnapshotForEngine]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
