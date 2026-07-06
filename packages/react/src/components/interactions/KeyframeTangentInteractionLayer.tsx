import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  TimelineEngine,
  TimelineInteractionGeometry,
  TimelineKeyframePropertyId,
  TimelineKeyframeSide,
  TimelineKeyframeTangentHandle,
  TimelineKeyframeTangentHandleHitTestResult,
} from '@techsquidtv/canvas-timeline-core';
import { defaultTimelineInteractionGeometry } from '@techsquidtv/canvas-timeline-core';
import { toSeconds } from '@techsquidtv/canvas-timeline-utils';
import {
  useTimeline,
  useTimelineKeyframeSegments,
  useTimelineKeyframeTangentDrag,
} from '../../hooks';
import { consumeTimelineDoubleTap } from './tapState';

interface HoveredTangentHandle {
  clipId: string;
  segmentId: string;
  keyframeId: string;
  side: TimelineKeyframeSide;
}

interface ActiveTangentHandle extends HoveredTangentHandle {
  target: HTMLElement;
}

/**
 * Details passed to a Bezier tangent handle double-click or double-tap callback.
 */
export interface KeyframeTangentHandleDoubleClickDetails {
  /** Timeline engine owning the keyframe. */
  engine: TimelineEngine;
  /** Original pointer event. */
  event: React.PointerEvent<HTMLDivElement>;
}

/**
 * Props for the delegated Bezier tangent interaction layer.
 */
export interface KeyframeTangentInteractionLayerProps
  extends
    Omit<React.HTMLAttributes<HTMLDivElement>, keyof TimelineInteractionGeometry>,
    TimelineInteractionGeometry {
  /** Keyframe property to render and hit-test. */
  property: TimelineKeyframePropertyId;
  /** Only render tangent handles owned by selected clips. Defaults to true. */
  selectedClipOnly?: boolean;
  /** Only render tangent handles touching selected keyframes. Defaults to true. */
  selectedKeyframeOnly?: boolean;
  /** Extra pixels around the viewport included in visible segment queries. */
  overscanPixels?: number;
  /** Keyframe affordance square size in CSS pixels. */
  keyframeSize?: number;
  /** Bezier control handle square size in CSS pixels. */
  tangentHandleSize?: number;
  /**
   * Invisible pointer padding in CSS pixels added around each Bezier handle.
   *
   * Presses inside the padded area target the tangent handle instead of falling
   * through to lower interaction layers such as the clip layer. Defaults to 8.
   */
  hitPadding?: number;
  /** Vertical padding used when mapping keyframe values into a clip row. */
  keyframeValuePadding?: number;
  /** Optional handler for double-click or double-tap gestures on tangent handles. */
  onTangentHandleDoubleClick?: (
    handle: TimelineKeyframeTangentHandle,
    details: KeyframeTangentHandleDoubleClickDetails
  ) => void;
  /** Optional accessible label formatter for a canvas-rendered tangent handle. */
  getTangentHandleAriaLabel?: (handle: TimelineKeyframeTangentHandleHitTestResult) => string;
}

function tangentHandleIdentity(handle: TimelineKeyframeTangentHandle) {
  return `${handle.clip.id}:${handle.segmentId}:${handle.side}`;
}

function isSameTangentHandle(
  left: HoveredTangentHandle | null,
  right: TimelineKeyframeTangentHandle
) {
  return (
    left?.clipId === right.clip.id &&
    left.segmentId === right.segmentId &&
    left.keyframeId === right.keyframe.id &&
    left.side === right.side
  );
}

function defaultTangentHandleAriaLabel(handle: TimelineKeyframeTangentHandleHitTestResult) {
  const endpoint =
    handle.side === 'outgoing'
      ? `outgoing from ${toSeconds(handle.anchorKeyframe.time).toFixed(2)} seconds`
      : `incoming to ${toSeconds(handle.anchorKeyframe.time).toFixed(2)} seconds`;
  return `${handle.keyframe.property} Bezier ${endpoint}`;
}

/**
 * Delegated Bezier tangent handle interaction surface for canvas-rendered timeline clips.
 */
export const KeyframeTangentInteractionLayer = React.forwardRef<
  HTMLDivElement,
  KeyframeTangentInteractionLayerProps
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
      property,
      selectedClipOnly = true,
      selectedKeyframeOnly = true,
      overscanPixels,
      keyframeSize,
      tangentHandleSize,
      hitPadding = 8,
      keyframeValuePadding,
      onTangentHandleDoubleClick,
      getTangentHandleAriaLabel,
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
    const activeHandleRef = useRef<ActiveTangentHandle | null>(null);
    const fallbackListenersRef = useRef<(() => void) | null>(null);
    const [hoveredHandle, setHoveredHandle] = useState<HoveredTangentHandle | null>(null);
    const geometry = useMemo(
      () => ({
        collapsedTrackHeight,
        tangentHandleSize,
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
        tangentHandleSize,
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
    const segments = useTimelineKeyframeSegments(geometry);
    const {
      cancelKeyframeTangentDrag,
      endKeyframeTangentDrag,
      moveKeyframeTangentDrag,
      startKeyframeTangentDrag,
    } = useTimelineKeyframeTangentDrag(geometry);

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
          cancelKeyframeTangentDrag();
        }
      };
    }, [cancelKeyframeTangentDrag, removeFallbackListeners]);

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
          endKeyframeTangentDrag();
        }
      },
      [endKeyframeTangentDrag, removeFallbackListeners]
    );

    const moveActiveDrag = useCallback(
      (event: Pick<PointerEvent | React.PointerEvent, 'clientX' | 'clientY'>) => {
        const point = getViewportPoint(event);
        if (!point) {
          return;
        }

        moveKeyframeTangentDrag({
          viewportX: point.x,
          viewportY: point.y,
        });
      },
      [getViewportPoint, moveKeyframeTangentDrag]
    );

    const handlePointerDown = useCallback(
      (event: React.PointerEvent<HTMLDivElement>, handle: TimelineKeyframeTangentHandle) => {
        onPointerDown?.(event);
        if (
          event.defaultPrevented ||
          !handle.canEdit ||
          (event.pointerType !== 'touch' && event.button !== 0)
        ) {
          return;
        }

        if (consumeTimelineDoubleTap(event)) {
          event.preventDefault();
          event.stopPropagation();
          onTangentHandleDoubleClick?.(handle, { engine, event });
          return;
        }

        const result = startKeyframeTangentDrag({
          tangentHandle: handle,
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
          side: handle.side,
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
        onTangentHandleDoubleClick,
        onPointerDown,
        removeFallbackListeners,
        startKeyframeTangentDrag,
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
          cancelKeyframeTangentDrag();
        }
      },
      [cancelKeyframeTangentDrag, onPointerCancel, removeFallbackListeners]
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
    const visibleHandles = segments.visibleTangentHandles;

    return (
      <div
        ref={ref}
        className={`timeline-keyframe-tangent-interaction-layer ${className}`.trim()}
        data-has-target={hoveredHandle ? 'true' : undefined}
        style={{
          top: `${rulerHeight}px`,
          cursor,
          ...style,
        }}
        {...props}
      >
        <svg className="timeline-keyframe-tangent-lines" aria-hidden="true">
          {visibleHandles.map((handle) => (
            <line
              key={`${tangentHandleIdentity(handle)}:line`}
              className="timeline-keyframe-tangent-line"
              x1={handle.anchorPoint.x}
              y1={handle.anchorPoint.y - rulerHeight}
              x2={handle.point.x}
              y2={handle.point.y - rulerHeight}
            />
          ))}
        </svg>
        {visibleHandles.map((handle) => {
          const active = isSameTangentHandle(activeHandleRef.current, handle);
          const hovered = isSameTangentHandle(hoveredHandle, handle);
          const pad = Math.max(0, hitPadding);

          return (
            <div
              key={tangentHandleIdentity(handle)}
              role="button"
              aria-label={(getTangentHandleAriaLabel ?? defaultTangentHandleAriaLabel)(handle)}
              tabIndex={handle.canEdit ? 0 : -1}
              className="timeline-keyframe-tangent-handle"
              data-clip-id={handle.clip.id}
              data-segment-id={handle.segmentId}
              data-keyframe-id={handle.keyframe.id}
              data-anchor-keyframe-id={handle.anchorKeyframe.id}
              data-side={handle.side}
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
                  side: handle.side,
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
                className="timeline-keyframe-tangent-handle-shape"
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

KeyframeTangentInteractionLayer.displayName = 'Timeline.KeyframeTangentInteractionLayer';
