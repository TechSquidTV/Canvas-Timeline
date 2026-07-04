import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  TimelineEngine,
  TimelineInteractionGeometry,
  TimelineKeyframeHitTestResult,
  TimelineKeyframeProperty,
  TimelineKeyframeRect,
} from '@techsquidtv/canvas-timeline-core';
import { defaultTimelineInteractionGeometry } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { useTimeline, useTimelineKeyframeDrag, useTimelineKeyframes } from '../../hooks';
import { consumeTimelineDoubleTap } from './tapState';

interface HoveredKeyframe {
  clipId: string;
  keyframeId: string;
}

interface ActiveKeyframe extends HoveredKeyframe {
  target: HTMLElement;
}

/**
 * Details passed to a keyframe double-click or double-tap callback.
 */
export interface KeyframeDoubleClickDetails {
  /** Timeline engine owning the keyframe. */
  engine: TimelineEngine;
  /** Original pointer event. */
  event: React.PointerEvent<HTMLDivElement>;
}

/**
 * Details passed to a keyframe keyboard delete callback.
 */
export interface KeyframeDeleteDetails {
  /** Timeline engine owning the keyframe. */
  engine: TimelineEngine;
  /** Original keyboard event. */
  event: React.KeyboardEvent<HTMLDivElement>;
}

/**
 * Props for the delegated keyframe interaction layer.
 */
export interface KeyframeInteractionLayerProps
  extends
    Omit<React.HTMLAttributes<HTMLDivElement>, keyof TimelineInteractionGeometry>,
    TimelineInteractionGeometry {
  /** Keyframe property to render and hit-test. Defaults to all supported properties. */
  property?: TimelineKeyframeProperty;
  /** Only render keyframes owned by selected clips. Defaults to false. */
  selectedClipOnly?: boolean;
  /** Extra pixels around the viewport included in visible keyframe queries. */
  overscanPixels?: number;
  /** Keyframe affordance square size in CSS pixels. */
  keyframeSize?: number;
  /**
   * Invisible pointer padding in CSS pixels added around each keyframe handle.
   *
   * Presses inside the padded area target the keyframe instead of falling
   * through to lower interaction layers such as the clip layer. Defaults to 8.
   */
  hitPadding?: number;
  /** Vertical padding used when mapping keyframe values into a clip row. */
  keyframeValuePadding?: number;
  /** Keyboard nudge amount in seconds for left/right arrow keys. Defaults to one 30fps frame. */
  keyboardStepSeconds?: number;
  /** Optional handler for double-click or double-tap gestures on keyframe handles. */
  onKeyframeDoubleClick?: (
    keyframe: TimelineKeyframeRect,
    details: KeyframeDoubleClickDetails
  ) => void;
  /** Optional handler for Delete/Backspace key gestures on keyframe handles. */
  onKeyframeDelete?: (keyframe: TimelineKeyframeRect, details: KeyframeDeleteDetails) => void;
  /** Optional accessible label formatter for a canvas-rendered keyframe. */
  getKeyframeAriaLabel?: (keyframe: TimelineKeyframeHitTestResult) => string;
}

function keyframeIdentity(entry: Pick<TimelineKeyframeHitTestResult, 'clip' | 'keyframe'>) {
  return `${entry.clip.id}:${entry.keyframe.id}`;
}

function defaultKeyframeAriaLabel(entry: TimelineKeyframeHitTestResult) {
  return `${entry.keyframe.property} keyframe at ${toSeconds(entry.keyframe.time).toFixed(2)} seconds`;
}

/**
 * Delegated keyframe interaction surface for canvas-rendered timeline clips.
 */
export const KeyframeInteractionLayer = React.forwardRef<
  HTMLDivElement,
  KeyframeInteractionLayerProps
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
      selectedClipOnly = false,
      overscanPixels,
      keyframeSize,
      hitPadding = 8,
      keyframeValuePadding,
      keyboardStepSeconds = 1 / 30,
      onKeyframeDoubleClick,
      onKeyframeDelete,
      getKeyframeAriaLabel,
      onPointerDown,
      onPointerMove,
      onPointerLeave,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture,
      onKeyDown,
      ...props
    },
    forwardedRef
  ) => {
    const { engine, state } = useTimeline();
    const internalRef = useRef<HTMLDivElement>(null);
    const activeKeyframeRef = useRef<ActiveKeyframe | null>(null);
    const fallbackListenersRef = useRef<(() => void) | null>(null);
    const [hoveredKeyframe, setHoveredKeyframe] = useState<HoveredKeyframe | null>(null);
    const geometry = useMemo(
      () => ({
        rulerHeight,
        trackHeight,
        collapsedTrackHeight,
        edgeThreshold,
        touchEdgeThreshold,
        property,
        selectedClipOnly,
        overscanPixels,
        keyframeSize,
        keyframeValuePadding,
        viewportWidth: state.viewportWidth,
        viewportHeight: state.viewportHeight,
      }),
      [
        collapsedTrackHeight,
        edgeThreshold,
        keyframeSize,
        keyframeValuePadding,
        overscanPixels,
        property,
        rulerHeight,
        selectedClipOnly,
        state.viewportHeight,
        state.viewportWidth,
        touchEdgeThreshold,
        trackHeight,
      ]
    );
    const keyframes = useTimelineKeyframes(geometry);
    const { cancelKeyframeDrag, endKeyframeDrag, moveKeyframeDrag, startKeyframeDrag } =
      useTimelineKeyframeDrag({
        collapsedTrackHeight,
        edgeThreshold,
        keyframeSize,
        keyframeValuePadding,
        rulerHeight,
        touchEdgeThreshold,
        trackHeight,
      });

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
        if (activeKeyframeRef.current) {
          activeKeyframeRef.current = null;
          cancelKeyframeDrag();
        }
      };
    }, [cancelKeyframeDrag, removeFallbackListeners]);

    const stopActiveDrag = useCallback(
      (event: PointerEvent, target: HTMLElement) => {
        const active = activeKeyframeRef.current;
        activeKeyframeRef.current = null;
        removeFallbackListeners();

        try {
          target.releasePointerCapture(event.pointerId);
        } catch {
          // Pointer capture may already be released by the browser.
        }

        if (active) {
          endKeyframeDrag();
        }
      },
      [endKeyframeDrag, removeFallbackListeners]
    );

    const moveActiveDrag = useCallback(
      (event: Pick<PointerEvent | React.PointerEvent, 'clientX' | 'clientY'>) => {
        const point = getViewportPoint(event);
        if (!point) {
          return;
        }

        moveKeyframeDrag({
          clientX: event.clientX,
          viewportY: point.y,
        });
      },
      [getViewportPoint, moveKeyframeDrag]
    );

    const handlePointerMove = (
      event: React.PointerEvent<HTMLDivElement>,
      entry: TimelineKeyframeHitTestResult
    ) => {
      onPointerMove?.(event);
      if (event.defaultPrevented) {
        return;
      }

      const active = activeKeyframeRef.current;
      if (active) {
        moveActiveDrag(event);
        return;
      }

      setHoveredKeyframe({
        clipId: entry.clip.id,
        keyframeId: entry.keyframe.id,
      });
    };

    const handlePointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
      onPointerLeave?.(event);
      if (event.defaultPrevented || activeKeyframeRef.current) {
        return;
      }

      setHoveredKeyframe(null);
    };

    const handlePointerDown = (
      event: React.PointerEvent<HTMLDivElement>,
      hit: TimelineKeyframeHitTestResult
    ) => {
      onPointerDown?.(event);
      if (event.defaultPrevented || (event.pointerType !== 'touch' && event.button !== 0)) {
        return;
      }

      const point = getViewportPoint(event);
      if (!point) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      engine.selectClip(hit.clip.id);
      engine.selectClipKeyframe(hit.clip.id, hit.keyframe.id);

      if (onKeyframeDoubleClick && consumeTimelineDoubleTap(event)) {
        onKeyframeDoubleClick(hit, {
          engine,
          event,
        });
        return;
      }

      if (!hit.canEdit) {
        return;
      }

      const target = event.currentTarget;
      const active = {
        clipId: hit.clip.id,
        keyframeId: hit.keyframe.id,
        target,
      };
      activeKeyframeRef.current = active;
      setHoveredKeyframe(active);
      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        // Document listeners below keep dragging functional if capture is unavailable.
      }

      removeFallbackListeners();
      const ownerDocument = target.ownerDocument;
      const handleDocumentPointerMove = (nativeEvent: PointerEvent) => {
        if (!activeKeyframeRef.current) {
          return;
        }
        moveActiveDrag(nativeEvent);
      };
      const handleDocumentPointerEnd = (nativeEvent: PointerEvent) => {
        if (!activeKeyframeRef.current) {
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

      startKeyframeDrag({
        clipId: hit.clip.id,
        keyframeId: hit.keyframe.id,
        clientX: event.clientX,
        viewportY: point.y,
        keyframeRect: hit,
      });
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
      onPointerUp?.(event);
      if (event.defaultPrevented || !activeKeyframeRef.current) {
        return;
      }

      stopActiveDrag(event.nativeEvent, event.currentTarget);
    };

    const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
      onPointerCancel?.(event);
      if (event.defaultPrevented || !activeKeyframeRef.current) {
        return;
      }

      stopActiveDrag(event.nativeEvent, event.currentTarget);
    };

    const handleLostPointerCapture = (event: React.PointerEvent<HTMLDivElement>) => {
      onLostPointerCapture?.(event);
      if (event.defaultPrevented || !activeKeyframeRef.current) {
        return;
      }

      stopActiveDrag(event.nativeEvent, event.currentTarget);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const clipId = target.dataset.clipId;
      const keyframeId = target.dataset.keyframeId;
      if (!clipId || !keyframeId) {
        return;
      }

      const found = keyframes.visibleKeyframes.find(
        (entry) => entry.clip.id === clipId && entry.keyframe.id === keyframeId
      );
      if (!found?.canEdit) {
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (onKeyframeDelete) {
          event.preventDefault();
          onKeyframeDelete(found, { engine, event });
        }
        return;
      }

      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return;
      }

      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      keyframes.updateKeyframe({
        clipId,
        keyframeId,
        time: fromSeconds(toSeconds(found.keyframe.time) + keyboardStepSeconds * direction),
      });
    };

    const cursor = activeKeyframeRef.current ? 'grabbing' : hoveredKeyframe ? 'grab' : undefined;

    return (
      <div
        ref={ref}
        className={`timeline-keyframe-interaction-layer ${className}`.trim()}
        data-has-target={hoveredKeyframe ? 'true' : undefined}
        onKeyDown={handleKeyDown}
        style={{
          top: `${rulerHeight}px`,
          cursor,
          ...style,
        }}
        {...props}
      >
        {keyframes.visibleKeyframes.map((entry) => {
          const active =
            activeKeyframeRef.current?.clipId === entry.clip.id &&
            activeKeyframeRef.current.keyframeId === entry.keyframe.id;
          const hovered =
            hoveredKeyframe?.clipId === entry.clip.id &&
            hoveredKeyframe.keyframeId === entry.keyframe.id;
          const pad = Math.max(0, hitPadding);

          return (
            <div
              key={keyframeIdentity(entry)}
              role="button"
              aria-label={(getKeyframeAriaLabel ?? defaultKeyframeAriaLabel)(entry)}
              tabIndex={entry.canEdit ? 0 : -1}
              className="timeline-keyframe-handle"
              data-clip-id={entry.clip.id}
              data-keyframe-id={entry.keyframe.id}
              data-property={entry.keyframe.property}
              data-selected={entry.keyframe.selected ? 'true' : undefined}
              data-active={active ? 'true' : undefined}
              data-hovered={hovered ? 'true' : undefined}
              data-editable={entry.canEdit ? 'true' : undefined}
              style={{
                transform: `translate(${entry.rect.x - pad}px, ${entry.rect.y - rulerHeight - pad}px)`,
                width: `${entry.rect.width + pad * 2}px`,
                height: `${entry.rect.height + pad * 2}px`,
              }}
              onFocus={() => {
                keyframes.selectKeyframe(entry.clip.id, entry.keyframe.id);
              }}
              onPointerDown={(event) => {
                handlePointerDown(event, entry);
              }}
              onPointerEnter={() => {
                setHoveredKeyframe({
                  clipId: entry.clip.id,
                  keyframeId: entry.keyframe.id,
                });
              }}
              onPointerMove={(event) => {
                handlePointerMove(event, entry);
              }}
              onPointerLeave={handlePointerLeave}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onLostPointerCapture={handleLostPointerCapture}
            >
              <div
                className="timeline-keyframe-handle-shape"
                aria-hidden="true"
                style={{
                  width: `${entry.rect.width}px`,
                  height: `${entry.rect.height}px`,
                }}
              />
            </div>
          );
        })}
      </div>
    );
  }
);

KeyframeInteractionLayer.displayName = 'Timeline.KeyframeInteractionLayer';
