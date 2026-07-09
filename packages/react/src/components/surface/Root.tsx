import React, { useRef, useEffect } from 'react';
import { useTimeline } from '#react/hooks';
import { clamp, toSeconds } from '@techsquidtv/canvas-timeline-utils';

interface ActivePointer {
  clientX: number;
  clientY: number;
  startX: number;
  startY: number;
}

export const Root = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children, className = '', ...props }, forwardedRef) => {
    const { engine } = useTimeline();
    const internalRef = useRef<HTMLDivElement>(null);

    const ref = React.useCallback(
      (node: HTMLDivElement | null) => {
        internalRef.current = node;
        if (typeof forwardedRef === 'function') {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef]
    );

    useEffect(() => {
      if (!internalRef.current) {
        return;
      }
      const el = internalRef.current;

      // Set initial viewport size.
      const initialRect = el.getBoundingClientRect();
      engine.setViewportWidth(initialRect.width);
      engine.setViewportHeight(initialRect.height);

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          engine.setViewportWidth(entry.contentRect.width);
          engine.setViewportHeight(entry.contentRect.height);
        }
      });

      resizeObserver.observe(el);

      return () => {
        resizeObserver.disconnect();
      };
    }, [engine]);

    useEffect(() => {
      const el = internalRef.current;
      if (!el) {
        return;
      }

      const handleWheel = (event: WheelEvent) => {
        // Zoom or pan based on standard conventions (e.g. shift+wheel or pinch zoom).
        if (event.shiftKey) {
          event.preventDefault();
          engine.setScrollLeft(Math.max(0, engine.scrollLeft + event.deltaY));
        } else if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          const zoomDelta = event.deltaY * -0.001;
          const newScale = Math.max(0.01, engine.zoomScale * (1 + zoomDelta));
          engine.setZoomScale(newScale);
        } else {
          event.preventDefault();
          engine.setScrollLeft(Math.max(0, engine.scrollLeft + event.deltaX));
          engine.setScrollTop(Math.max(0, engine.scrollTop + event.deltaY));
        }
      };

      el.addEventListener('wheel', handleWheel, { passive: false });

      return () => {
        el.removeEventListener('wheel', handleWheel);
      };
    }, [engine]);

    // Track active pointers for multi-touch navigation (panning & pinch-to-zoom)
    const activePointers = useRef<Map<number, ActivePointer>>(new Map());
    const isDragging = useRef(false);
    const startScrollLeft = useRef(0);
    const startScrollTop = useRef(0);
    const startZoomScale = useRef(1);
    const startPinchDistance = useRef(0);

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.target === internalRef.current) {
        engine.selectClip(null);
      }

      e.currentTarget.setPointerCapture(e.pointerId);

      activePointers.current.set(e.pointerId, {
        clientX: e.clientX,
        clientY: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
      });

      if (activePointers.current.size === 1) {
        isDragging.current = true;
        startScrollLeft.current = engine.scrollLeft;
        startScrollTop.current = engine.scrollTop;
      } else if (activePointers.current.size === 2) {
        isDragging.current = false;
        const pts = Array.from(activePointers.current.values());
        const dx = pts[0].clientX - pts[1].clientX;
        const dy = pts[0].clientY - pts[1].clientY;
        startPinchDistance.current = Math.hypot(dx, dy);
        startZoomScale.current = engine.zoomScale;
        startScrollLeft.current = engine.scrollLeft;
        startScrollTop.current = engine.scrollTop;
      }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      const pt = activePointers.current.get(e.pointerId);
      if (!pt) {
        return;
      }

      pt.clientX = e.clientX;
      pt.clientY = e.clientY;

      if (activePointers.current.size === 1 && isDragging.current) {
        const deltaX = e.clientX - pt.startX;
        const deltaY = e.clientY - pt.startY;
        engine.setScrollLeft(Math.max(0, startScrollLeft.current - deltaX));
        engine.setScrollTop(Math.max(0, startScrollTop.current - deltaY));
      } else if (activePointers.current.size === 2) {
        const pts = Array.from(activePointers.current.values());
        const dx = pts[0].clientX - pts[1].clientX;
        const dy = pts[0].clientY - pts[1].clientY;
        const currentDistance = Math.hypot(dx, dy);

        if (startPinchDistance.current > 10) {
          const ratio = currentDistance / startPinchDistance.current;
          const newScale = clamp(
            startZoomScale.current * ratio,
            engine.minZoomScale,
            engine.maxZoomScale
          );

          // Zoom centered around the pinch midpoint
          const midX = (pts[0].clientX + pts[1].clientX) / 2;
          if (internalRef.current) {
            const rect = internalRef.current.getBoundingClientRect();
            const localMidX = midX - rect.left;

            // Timestamp at midpoint before the zoom change
            const timeAtMid = engine.pixelToTime(localMidX);

            engine.setZoomScale(newScale);

            // Re-calculate scrollLeft to keep timeAtMid exactly under the midpoint pointer
            const newScrollLeft = Math.max(0, toSeconds(timeAtMid) * newScale - localMidX);
            engine.setScrollLeft(newScrollLeft);
          } else {
            engine.setZoomScale(newScale);
          }
        }
      }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      activePointers.current.delete(e.pointerId);

      if (activePointers.current.size === 0) {
        isDragging.current = false;
        engine.settle();
      } else if (activePointers.current.size === 1) {
        // Transition smoothly back to 1-finger dragging
        isDragging.current = true;
        const remainingPointerId = Array.from(activePointers.current.keys())[0];
        const pt = activePointers.current.get(remainingPointerId);
        if (pt) {
          pt.startX = pt.clientX;
          pt.startY = pt.clientY;
        }
        startScrollLeft.current = engine.scrollLeft;
        startScrollTop.current = engine.scrollTop;
      }
    };

    return (
      <div
        ref={ref}
        className={`relative overflow-hidden w-full h-full timeline-root select-none touch-none ${className}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Root.displayName = 'Timeline.Root';
