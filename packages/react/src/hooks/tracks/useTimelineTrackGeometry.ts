import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { defaultTimelineInteractionGeometry } from '@techsquidtv/canvas-timeline-core';
import type {
  TimelineEngine,
  TimelineStateSnapshot,
  TimelineTrackGeometryOptions,
  TimelineTrackRect,
} from '@techsquidtv/canvas-timeline-core';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

const stores = new WeakMap<TimelineEngine, Map<string, ReturnType<typeof createStore>>>();

function createStore(
  engine: TimelineEngine,
  options: TimelineTrackGeometryOptions,
  release: () => void,
  retain: () => void
) {
  let previous: TimelineStateSnapshot | undefined;
  let rectangles = new Map<string, Readonly<TimelineTrackRect>>();
  const listeners = new Set<() => void>();
  let unsubscribe: (() => void)[] = [];
  const update = () => {
    const state = engine.getState();
    if (
      previous &&
      state.scrollTop === previous.scrollTop &&
      state.viewportWidth === previous.viewportWidth &&
      state.tracks.length === previous.tracks.length &&
      state.tracks.every((track, index) => {
        const prior = previous?.tracks[index];
        return (
          track.id === prior?.id &&
          track.height === prior.height &&
          track.collapsed === prior.collapsed
        );
      })
    ) {
      previous = state;
      return;
    }
    previous = state;
    rectangles = new Map(
      engine.geometry.getTrackRects(options).map((rect) => {
        const prior = rectangles.get(rect.trackId);
        return [
          rect.trackId,
          prior &&
          (Object.keys(rect) as (keyof TimelineTrackRect)[]).every(
            (key) => rect[key] === prior[key]
          )
            ? prior
            : Object.freeze(rect),
        ];
      })
    );
    listeners.forEach((listener) => listener());
  };
  update();
  return {
    get: (trackId: string) => rectangles.get(trackId) ?? null,
    subscribe: (listener: () => void) => {
      if (listeners.size === 0) {
        retain();
        unsubscribe = [engine.on('state:settled', update), engine.on('content:change', update)];
        update();
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          unsubscribe.forEach((dispose) => dispose());
          release();
        }
      };
    },
  };
}

/** Shares row geometry across consumers using the same normalized layout options. */
export function useTimelineTrackGeometry(trackId: string, options: TimelineTrackGeometryOptions) {
  const engine = useTimelineEngine();
  const rulerHeight = options.rulerHeight ?? defaultTimelineInteractionGeometry.rulerHeight;
  const trackHeight = options.trackHeight ?? defaultTimelineInteractionGeometry.trackHeight;
  const collapsedTrackHeight =
    options.collapsedTrackHeight ?? defaultTimelineInteractionGeometry.collapsedTrackHeight;
  const viewportWidth = options.viewportWidth;
  const store = useMemo(() => {
    let engineStores = stores.get(engine);
    if (!engineStores) {
      engineStores = new Map();
      stores.set(engine, engineStores);
    }
    const key = [rulerHeight, trackHeight, collapsedTrackHeight, viewportWidth ?? 'auto'].join(':');
    let result = engineStores.get(key);
    if (!result) {
      result = createStore(
        engine,
        { rulerHeight, trackHeight, collapsedTrackHeight, viewportWidth },
        () => {
          if (engineStores.get(key) === result) {
            engineStores.delete(key);
          }
        },
        () => {
          if (result) {
            engineStores.set(key, result);
          }
        }
      );
      engineStores.set(key, result);
    }
    return result;
  }, [engine, rulerHeight, trackHeight, collapsedTrackHeight, viewportWidth]);
  const getSnapshot = useCallback(() => store.get(trackId), [store, trackId]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
