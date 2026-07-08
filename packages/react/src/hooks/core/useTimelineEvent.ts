import { useEffect, useRef } from 'react';
import type { EngineEventMap } from '@techsquidtv/canvas-timeline-core';
import { useTimeline } from '#react/hooks/core/useTimeline';

/**
 * Callback signature for a typed TimelineEngine event subscription.
 *
 * @template EventName - Timeline engine event name from `EngineEventMap`.
 *
 * @see {@link useTimelineEvent}
 * @see {@link https://canvastimeline.com/docs/events-and-lifecycle | Events and lifecycle}
 */
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
 * @remarks
 *
 * The hook keeps the event subscription stable while updating the callback ref
 * every render, avoiding stale closures without resubscribing for handler-only
 * changes. Use it for low-level integration work such as analytics, custom
 * status panels, or imperative bridges. Prefer focused hooks such as
 * {@link useTimelinePlayheadTime} or {@link useTimelineClipDropFeedback} when a
 * public hook already exists for the state you need.
 *
 * @param eventName - TimelineEngine event name to subscribe to.
 * @param handler - Callback invoked with the typed event payload.
 * @param options - Optional subscription controls.
 * @template EventName - Timeline engine event name from `EngineEventMap`.
 * @returns Nothing; the subscription is managed for the component lifetime.
 *
 * @example
 * ```tsx
 * import { useState } from 'react';
 * import { useTimelineEvent } from '#react/hooks';
 *
 * export function PlaybackRateReadout() {
 *   const [rate, setRate] = useState(1);
 *
 *   useTimelineEvent('playback:rate', setRate);
 *
 *   return <span>{rate}x</span>;
 * }
 * ```
 *
 * @see {@link https://canvastimeline.com/docs/events-and-lifecycle | Events and lifecycle}
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
