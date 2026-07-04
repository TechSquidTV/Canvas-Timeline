import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  TimelineEngine,
  TimelineInteractionGeometry,
  TimelineKeyframeCurveHandle,
  TimelineKeyframeCurveHandleHitTestResult,
  TimelineKeyframeProperty,
} from '@techsquidtv/canvas-timeline-core';
import { defaultTimelineInteractionGeometry } from '@techsquidtv/canvas-timeline-core';
import { toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { useTimeline, useTimelineKeyframeCurveDrag, useTimelineKeyframeCurves } from '../../hooks';
import { consumeTimelineDoubleTap } from './tapState';

interface HoveredCurveHandle {
  clipId: string;
  segmentId: string;
  keyframeId: string;
  handle: TimelineKeyframeCurveHandle['handle'];
}

interface ActiveCurveHandle extends HoveredCurveHandle {
  target: HTMLElement;
}

/**
 * Details passed to a Bezier curve handle double-click or double-tap callback.
 */
export interface KeyframeCurveHandleDoubleClickDetails {
  /** Timeline engine owning the keyframe. */
  engine: TimelineEngine;
  /** Original pointer event. */
  event: React.PointerEvent<HTMLDivElement>;
}

/**
 * Props for the delegated Bezier curve interaction layer.
 */
export interface KeyframeCurveInteractionLayerProps
  extends
    Omit<React.HTMLAttributes<HTMLDivElement>, keyof TimelineInteractionGeometry>,
    TimelineInteractionGeometry {
  /** Keyframe property to render and hit-test. Defaults to opacity. */
  property?: TimelineKeyframeProperty;
  /** Only render curve handles owned by selected clips. Defaults to true. */
  selectedClipOnly?: boolean;
  /** Only render curve handles touching selected keyframes. Defaults to true. */
  selectedKeyframeOnly?: boolean;
  /** Extra pixels around the viewport included in visible curve queries. */
  overscanPixels?: number;
  /** Keyframe affordance square size in CSS pixels. */
  keyframeSize?: number;
  /** Bezier control handle square size in CSS pixels. */
  curveHandleSize?: number;
  /**
   * Invisible pointer padding in CSS pixels added around each Bezier handle.
   *
   * Presses inside the padded area target the curve handle instead of falling
   * through to lower interaction layers such as the clip layer. Defaults to 8.
   */
  hitPadding?: number;
  /** Vertical padding used when mapping keyframe values into a clip row. */
  keyframeValuePadding?: number;
  /** Optional handler for double-click or double-tap gestures on curve handles. */
  onCurveHandleDoubleClick?: (
    handle: TimelineKeyframeCurveHandle,
    details: KeyframeCurveHandleDoubleClickDetails
  ) => void;
  /** Optional accessible label formatter for a canvas-rendered curve handle. */
  getCurveHandleAriaLabel?: (handle: TimelineKeyframeCurveHandleHitTestResult) => string;
}

function curveHandleIdentity(handle: TimelineKeyframeCurveHandle) {
  return `${handle.clip.id}:${handle.segmentId}:${handle.handle}`;
}

function isSameCurveHandle(left: HoveredCurveHandle | null, right: TimelineKeyframeCurveHandle) {
  return (
    left?.clipId === right.clip.id &&
    left.segmentId === right.segmentId &&
    left.keyframeId === right.keyframe.id &&
    left.handle === right.handle
  );
}

function defaultCurveHandleAriaLabel(handle: TimelineKeyframeCurveHandleHitTestResult) {
  const endpoint =
    handle.handle === 'outgoing'
      ? `outgoing from ${toSeconds(handle.anchorKeyframe.time).toFixed(2)} seconds`
      : `incoming to ${toSeconds(handle.anchorKeyframe.time).toFixed(2)} seconds`;
  return `${handle.keyframe.property} Bezier ${endpoint}`;
}

/**
 * Delegated Bezier curve handle interaction surface for canvas-rendered timeline clips.
 */
export const KeyframeCurveInteractionLayer = React.forwardRef<
  HTMLDivElement,
  KeyframeCurveInteractionLayerProps
>(
  (
    {
      className = '',
      style,
      rulerHeight = defaultTimelineInteractionGeometry.rulerHeight,
      trackHeight = defaultTimelineInteractionGeometry.trackHeight,
      collapsedTrackHeight = defaultTimelineInteractionGeometry.collapsedTrackHeight,
      edgeThreshold = defaultTimelineInteractionGeometry.edgeThreshold,
      touchEdgeThreshold = defaultTimelineInteractionGeometry.touchEdgeThreshold,
      property = 'opacity',
      selectedClipOnly = true,
      selectedKeyframeOnly = true,
      overscanPixels,
      keyframeSize,
      curveHandleSize,
      hitPadding = 8,
      keyframeValuePadding,
      onCurveHandleDoubleClick,
      getCurveHandleAriaLabel,
      onPointerDown,
      onPointerMove,
      onPointerLeave,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture,
      ...props
    },
    forwardedRef
  ) => {
    const { engine } = useTimeline();
    const internalRef = useRef<HTMLDivElement>(null);
    const activeHandleRef = useRef<ActiveCurveHandle | null>(null);
    const fallbackListenersRef = useRef<(() => void) | null>(null);
    const [hoveredHandle, setHoveredHandle] = useState<HoveredCurveHandle | null>(null);
    const geometry = useMemo(
      () => ({
        collapsedTrackHeight,
        curveHandleSize,
        edgeThreshold,
        keyframeSize,
        keyframeValuePadding,
        overscanPixels,
        property,
        rulerHeight,
        selectedClipOnly,
        selectedKeyframeOnly,
        touchEdgeThreshold,
        trackHeight,
      }),
      [
        collapsedTrackHeight,
        curveHandleSize,
        edgeThreshold,
        keyframeSize,
        keyframeValuePadding,
        overscanPixels,
        property,
        rulerHeight,
        selectedClipOnly,
        selectedKeyframeOnly,
        touchEdgeThreshold,
        trackHeight,
      ]
    );
    const curves = useTimelineKeyframeCurves(geometry);
    const {
      cancelKeyframeCurveDrag,
      endKeyframeCurveDrag,
      moveKeyframeCurveDrag,
      startKeyframeCurveDrag,
    } = useTimelineKeyframeCurveDrag(geometry);

    const ref = useCallback(
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

    const getViewportPoint = useCallback(
      (event: Pick<PointerEvent | React.PointerEvent, 'clientX' | 'clientY'>) => {
        const rect = internalRef.current?.getBoundingClientRect();
        if (!rect) {
          return null;
        }

        return {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top + rulerHeight,
        };
      },
      [rulerHeight]
    );

    const removeFallbackListeners = useCallback(() => {
      fallbackListenersRef.current?.();
      fallbackListenersRef.current = null;
    }, []);

    useEffect(() => {
      return () => {
        removeFallbackListeners();
        if (activeHandleRef.current) {
          activeHandleRef.current = null;
          cancelKeyframeCurveDrag();
        }
      };
    }, [cancelKeyframeCurveDrag, removeFallbackListeners]);

    const stopActiveDrag = useCallback(
      (event: PointerEvent | React.PointerEvent, target: HTMLElement) => {
        const active = activeHandleRef.current;
        activeHandleRef.current = null;
        removeFallbackListeners();

        try {
          target.releasePointerCapture(event.pointerId);
        } catch {
          // Pointer capture may already be released by the browser.
        }

        if (active) {
          endKeyframeCurveDrag();
        }
      },
      [endKeyframeCurveDrag, removeFallbackListeners]
    );

    const moveActiveDrag = useCallback(
      (event: Pick<PointerEvent | React.PointerEvent, 'clientX' | 'clientY'>) => {
        const point = getViewportPoint(event);
        if (!point) {
          return;
        }

        moveKeyframeCurveDrag({
          viewportX: point.x,
          viewportY: point.y,
        });
      },
      [getViewportPoint, moveKeyframeCurveDrag]
    );

    const handlePointerDown = useCallback(
      (event: React.PointerEvent<HTMLDivElement>, handle: TimelineKeyframeCurveHandle) => {
        onPointerDown?.(event);
        if (
          event.defaultPrevented ||
          !handle.canEdit ||
          (event.pointerType !== 'touch' && event.button !== 0)
        ) {
          return;
        }

        if (consumeTimelineDoubleTap(event)) {
          onCurveHandleDoubleClick?.(handle, { engine, event });
          return;
        }

        const result = startKeyframeCurveDrag({
          clipId: handle.clip.id,
          segmentId: handle.segmentId,
          keyframeId: handle.keyframe.id,
          handle: handle.handle,
          curveHandle: handle,
        });
        if (!result.ok) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        engine.selectClipKeyframe(handle.clip.id, handle.anchorKeyframe.id);

        const target = event.currentTarget;
        activeHandleRef.current = {
          clipId: handle.clip.id,
          segmentId: handle.segmentId,
          keyframeId: handle.keyframe.id,
          handle: handle.handle,
          target,
        };
        try {
          target.setPointerCapture(event.pointerId);
        } catch {
          // Document listeners below keep dragging functional if capture is unavailable.
        }

        removeFallbackListeners();
        const ownerDocument = target.ownerDocument;
        const handleDocumentPointerMove = (nativeEvent: PointerEvent) => {
          if (!activeHandleRef.current) {
            return;
          }
          moveActiveDrag(nativeEvent);
        };
        const handleDocumentPointerEnd = (nativeEvent: PointerEvent) => {
          if (!activeHandleRef.current) {
            return;
          }
          stopActiveDrag(nativeEvent, target);
        };
        ownerDocument.addEventListener('pointermove', handleDocumentPointerMove);
        ownerDocument.addEventListener('pointerup', handleDocumentPointerEnd);
        ownerDocument.addEventListener('pointercancel', handleDocumentPointerEnd);
        fallbackListenersRef.current = () => {
          ownerDocument.removeEventListener('pointermove', handleDocumentPointerMove);
          ownerDocument.removeEventListener('pointerup', handleDocumentPointerEnd);
          ownerDocument.removeEventListener('pointercancel', handleDocumentPointerEnd);
        };
      },
      [
        engine,
        moveActiveDrag,
        onCurveHandleDoubleClick,
        onPointerDown,
        removeFallbackListeners,
        startKeyframeCurveDrag,
        stopActiveDrag,
      ]
    );

    const handlePointerMove = useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        onPointerMove?.(event);
        if (!activeHandleRef.current || event.defaultPrevented) {
          return;
        }

        moveActiveDrag(event);
      },
      [moveActiveDrag, onPointerMove]
    );

    const handlePointerUp = useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        onPointerUp?.(event);
        if (activeHandleRef.current) {
          stopActiveDrag(event, event.currentTarget);
        }
      },
      [onPointerUp, stopActiveDrag]
    );

    const handlePointerCancel = useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        onPointerCancel?.(event);
        if (activeHandleRef.current) {
          activeHandleRef.current = null;
          removeFallbackListeners();
          cancelKeyframeCurveDrag();
        }
      },
      [cancelKeyframeCurveDrag, onPointerCancel, removeFallbackListeners]
    );

    const handleLostPointerCapture = useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        onLostPointerCapture?.(event);
        if (activeHandleRef.current) {
          stopActiveDrag(event, event.currentTarget);
        }
      },
      [onLostPointerCapture, stopActiveDrag]
    );

    const cursor = activeHandleRef.current ? 'grabbing' : hoveredHandle ? 'grab' : undefined;
    const visibleHandles = curves.visibleCurveHandles;

    return (
      <div
        ref={ref}
        className={`timeline-keyframe-curve-interaction-layer ${className}`.trim()}
        data-has-target={hoveredHandle ? 'true' : undefined}
        style={{
          top: `${rulerHeight}px`,
          cursor,
          ...style,
        }}
        {...props}
      >
        <svg className="timeline-keyframe-curve-lines" aria-hidden="true">
          {visibleHandles.map((handle) => (
            <line
              key={`${curveHandleIdentity(handle)}:line`}
              className="timeline-keyframe-curve-line"
              x1={handle.anchorPoint.x}
              y1={handle.anchorPoint.y - rulerHeight}
              x2={handle.point.x}
              y2={handle.point.y - rulerHeight}
            />
          ))}
        </svg>
        {visibleHandles.map((handle) => {
          const active = isSameCurveHandle(activeHandleRef.current, handle);
          const hovered = isSameCurveHandle(hoveredHandle, handle);
          const pad = Math.max(0, hitPadding);

          return (
            <div
              key={curveHandleIdentity(handle)}
              role="button"
              aria-label={(getCurveHandleAriaLabel ?? defaultCurveHandleAriaLabel)(handle)}
              tabIndex={handle.canEdit ? 0 : -1}
              className="timeline-keyframe-curve-handle"
              data-clip-id={handle.clip.id}
              data-segment-id={handle.segmentId}
              data-keyframe-id={handle.keyframe.id}
              data-anchor-keyframe-id={handle.anchorKeyframe.id}
              data-handle={handle.handle}
              data-active={active ? 'true' : undefined}
              data-hovered={hovered ? 'true' : undefined}
              data-editable={handle.canEdit ? 'true' : undefined}
              style={{
                transform: `translate(${handle.rect.x - pad}px, ${handle.rect.y - rulerHeight - pad}px)`,
                width: `${handle.rect.width + pad * 2}px`,
                height: `${handle.rect.height + pad * 2}px`,
              }}
              onFocus={() => {
                engine.selectClipKeyframe(handle.clip.id, handle.anchorKeyframe.id);
              }}
              onPointerDown={(event) => {
                handlePointerDown(event, handle);
              }}
              onPointerEnter={() => {
                setHoveredHandle({
                  clipId: handle.clip.id,
                  segmentId: handle.segmentId,
                  keyframeId: handle.keyframe.id,
                  handle: handle.handle,
                });
              }}
              onPointerMove={handlePointerMove}
              onPointerLeave={(event) => {
                setHoveredHandle(null);
                onPointerLeave?.(event);
              }}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onLostPointerCapture={handleLostPointerCapture}
            >
              <div
                className="timeline-keyframe-curve-handle-shape"
                aria-hidden="true"
                style={{
                  width: `${handle.rect.width}px`,
                  height: `${handle.rect.height}px`,
                }}
              />
            </div>
          );
        })}
      </div>
    );
  }
);

KeyframeCurveInteractionLayer.displayName = 'Timeline.KeyframeCurveInteractionLayer';
