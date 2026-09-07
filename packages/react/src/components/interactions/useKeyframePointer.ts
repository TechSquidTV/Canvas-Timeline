import { useEffect, useRef, useLayoutEffect } from 'react';
import type { RefObject } from 'react';

interface ViewportPoint {
  x: number;
  y: number;
}
interface KeyframePointerOptions<Target> {
  root: RefObject<HTMLDivElement | null>;
  rulerHeight: number;
  hitTest: (point: ViewportPoint, event: PointerEvent) => Target | null;
  hover: (target: Target | null) => void;
  start: (target: Target, point: ViewportPoint, event: PointerEvent) => boolean;
  move: (point: ViewportPoint, event: PointerEvent) => void;
  end: (cancelled: boolean) => void;
}

/** One captured pointer, cached drag bounds, and fallback listeners only when capture fails. */
export function useKeyframePointer<Target>(options: KeyframePointerOptions<Target>) {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const root = options.root.current;
    const parent = root?.parentElement;
    if (!root || !parent) {
      return;
    }
    let active: { pointerId: number; bounds: DOMRect } | null = null;
    let disposeFallback: (() => void) | null = null;
    const point = (event: PointerEvent, bounds: DOMRect): ViewportPoint => ({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top + latest.current.rulerHeight,
    });
    const finish = (cancelled: boolean) => {
      if (!active) {
        return;
      }
      const id = active.pointerId;
      active = null;
      disposeFallback?.();
      disposeFallback = null;
      latest.current.end(cancelled);
      try {
        root.releasePointerCapture(id);
      } catch {
        /* Already released. */
      }
    };
    cancelRef.current = () => finish(true);
    const move = (event: PointerEvent) => {
      if (active) {
        if (event.pointerId !== active.pointerId) {
          return;
        }
        latest.current.move(point(event, active.bounds), event);
        event.stopImmediatePropagation();
      } else if (!event.defaultPrevented) {
        latest.current.hover(
          latest.current.hitTest(point(event, root.getBoundingClientRect()), event)
        );
      }
    };
    const end = (event: PointerEvent) => {
      if (active?.pointerId !== event.pointerId) {
        return;
      }
      finish(event.type !== 'pointerup');
      event.stopImmediatePropagation();
    };
    const down = (event: PointerEvent) => {
      if (
        active ||
        event.defaultPrevented ||
        (event.button !== 0 && event.pointerType !== 'touch')
      ) {
        return;
      }
      const bounds = root.getBoundingClientRect();
      const position = point(event, bounds);
      const hit = latest.current.hitTest(position, event);
      if (!hit) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      root.focus({ preventScroll: true });
      if (!latest.current.start(hit, position, event)) {
        return;
      }
      active = { pointerId: event.pointerId, bounds };
      try {
        root.setPointerCapture(event.pointerId);
      } catch {
        const doc = root.ownerDocument;
        doc.addEventListener('pointermove', move);
        doc.addEventListener('pointerup', end);
        doc.addEventListener('pointercancel', end);
        disposeFallback = () => {
          doc.removeEventListener('pointermove', move);
          doc.removeEventListener('pointerup', end);
          doc.removeEventListener('pointercancel', end);
        };
      }
    };
    // Capture on the stage lets blank areas pass through to clip/playhead layers.
    parent.addEventListener('pointerdown', down, true);
    parent.addEventListener('pointermove', move, true);
    parent.addEventListener('pointerup', end, true);
    parent.addEventListener('pointercancel', end, true);
    root.addEventListener('lostpointercapture', end);
    return () => {
      finish(true);
      parent.removeEventListener('pointerdown', down, true);
      parent.removeEventListener('pointermove', move, true);
      parent.removeEventListener('pointerup', end, true);
      parent.removeEventListener('pointercancel', end, true);
      root.removeEventListener('lostpointercapture', end);
      cancelRef.current = null;
    };
  }, [options.root]);
  return () => cancelRef.current?.();
}
