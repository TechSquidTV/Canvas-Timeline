import { useEffect, useRef } from 'react';
import type { EngineEventMap } from '@techsquidtv/canvas-timeline-core';
import { useTimeline } from './useTimeline';

/** Callback signature for a typed TimelineEngine event subscription. */
export type TimelineEventHandler<EventName extends keyof EngineEventMap> =
  EngineEventMap[EventName] extends void
    ? () => void
    : (payload: EngineEventMap[EventName]) => void;

/** Options for `useTimelineEvent`. */
export interface TimelineEventOptions {
  /** Whether the subscription should be active. Defaults to true. */
  enabled?: boolean;
}

/**
 * Subscribes to a typed TimelineEngine event with a React-safe latest handler.
 *
 * The hook keeps the event subscription stable while updating the callback ref
 * every render, avoiding stale closures without resubscribing for handler-only
 * changes.
 *
 * @param eventName - TimelineEngine event name to subscribe to.
 * @param handler - Callback invoked with the typed event payload.
 * @param options - Optional subscription controls.
 */
export function useTimelineEvent<EventName extends keyof EngineEventMap>(
  eventName: EventName,
  handler: TimelineEventHandler<EventName>,
  options: TimelineEventOptions = {}
) {
  const { enabled = true } = options;
  const { engine } = useTimeline();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    return engine.on(eventName, ((payload: EngineEventMap[EventName]) => {
      (handlerRef.current as (payload: EngineEventMap[EventName]) => void)(payload);
    }) as (payload: EngineEventMap[EventName]) => void);
  }, [enabled, engine, eventName]);
}
