import React from 'react';
import type { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';

/** Engine events that should refresh an imperatively positioned timeline element. */
export type TimelineTimePositionEvent =
  | 'render'
  | 'playhead:scrub'
  | 'state:inOut'
  | 'state:settled'
  | 'history:change';

/**
 * Options for `useTimelineTimePosition`.
 *
 * @remarks
 *
 * Use this primitive for a small number of DOM affordances that should move
 * with timeline time without causing React renders on every scroll, scrub, or
 * playback tick. The engine converts time to viewport X coordinates; the hook
 * writes the transform directly to the referenced element.
 *
 * @see {@link https://canvastimeline.com/docs/react-hooks | React editor hooks}
 */
export interface UseTimelineTimePositionOptions {
  /** Timeline engine that converts time to viewport-space pixels. */
  engine: TimelineEngine;
  /** Current time represented by the positioned element. */
  time: RationalTime;
  /** Optional resolver for imperative event-driven updates. */
  getTime?: () => RationalTime;
  /** Event names that should re-sync DOM position without a React render. */
  positionEvents?: TimelineTimePositionEvent[];
}

/**
 * Result returned by `useTimelineTimePosition`.
 *
 * @template T - HTMLElement type that receives the viewport-space transform.
 */
export interface UseTimelineTimePositionResult<T extends HTMLElement> {
  /** Ref for the element that should be translated in viewport coordinates. */
  ref: React.RefObject<T | null>;
  /** Immediately re-syncs the element transform to the latest time. */
  updatePosition: () => void;
}

const DEFAULT_POSITION_EVENTS: TimelineTimePositionEvent[] = ['render'];

function getPositionEventsKey(positionEvents: TimelineTimePositionEvent[]) {
  return positionEvents.join('\0');
}

function parsePositionEventsKey(positionEventsKey: string): TimelineTimePositionEvent[] {
  return positionEventsKey === ''
    ? []
    : (positionEventsKey.split('\0') as TimelineTimePositionEvent[]);
}

/**
 * Imperatively positions a low-count DOM affordance at a timeline time.
 *
 * The returned transform is viewport-space: `seconds * zoomScale - scrollLeft`.
 * Use it for standalone affordances such as the playhead grabber. Range
 * controls that already live inside a transformed timeline overlay should use
 * their local control primitive positioning instead.
 *
 * @param options - Timeline engine, time value, and events that should refresh the transform.
 * @returns Ref and imperative updater for the positioned element.
 * @template T - HTMLElement type that receives the viewport-space transform.
 *
 * @example
 * ```tsx
 * import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
 * import { useTimeline, useTimelineTimePosition } from '@techsquidtv/canvas-timeline-react/hooks';
 *
 * export function MarkerHead({ markerTime }: { markerTime: RationalTime }) {
 *   const { engine } = useTimeline();
 *   const position = useTimelineTimePosition<HTMLDivElement>({
 *     engine,
 *     time: markerTime,
 *     positionEvents: ['render', 'state:settled'],
 *   });
 *
 *   return <div ref={position.ref} className="marker-head" />;
 * }
 * ```
 *
 * @see {@link https://canvastimeline.com/docs/react-hooks | React editor hooks}
 */
export function useTimelineTimePosition<T extends HTMLElement>({
  engine,
  getTime,
  positionEvents = DEFAULT_POSITION_EVENTS,
  time,
}: UseTimelineTimePositionOptions): UseTimelineTimePositionResult<T> {
  const internalRef = React.useRef<T | null>(null);
  const positionEventsKey = React.useMemo(
    () => getPositionEventsKey(positionEvents),
    [positionEvents]
  );
  const stablePositionEvents = React.useMemo(
    () => parsePositionEventsKey(positionEventsKey),
    [positionEventsKey]
  );

  const updatePosition = React.useCallback(() => {
    if (!internalRef.current) {
      return;
    }
    const x = engine.timeToPixel(getTime?.() ?? time);
    internalRef.current.style.transform = `translateX(${x}px)`;
  }, [engine, getTime, time]);

  React.useEffect(() => {
    updatePosition();
    const unsubscribers = stablePositionEvents.map((eventName) =>
      engine.on(eventName, updatePosition)
    );
    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, [engine, stablePositionEvents, updatePosition]);

  return { ref: internalRef, updatePosition };
}
