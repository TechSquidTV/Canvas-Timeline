import { consumeTimelineDoubleTap } from '#react/components/interactions/tapState';
import { useKeyframePointer } from '#react/components/interactions/useKeyframePointer';
import { useTimelineKeyframeSegments, useTimelineKeyframeTangentDrag } from '#react/hooks';
import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { defaultTimelineInteractionGeometry } from '@techsquidtv/canvas-timeline-core';
import type {
  TimelineEngine,
  TimelineInteractionGeometry,
  TimelineKeyframePropertyId,
  TimelineKeyframeTangentHandle,
  TimelineKeyframeTangentHandleHitTestResult,
} from '@techsquidtv/canvas-timeline-core';
import React, { useCallback, useMemo, useRef, useState } from 'react';
/**
 * Details passed to a Bezier tangent handle double-click or double-tap callback.
 */
export interface KeyframeTangentHandleDoubleClickDetails {
  /** Timeline engine owning the keyframe. */
  engine: TimelineEngine;
  /** Original pointer event. */
  event: PointerEvent;
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

/** Delegated tangent editor with one pointer/focus target and keyboard control. */
export const KeyframeTangentInteractionLayer = React.forwardRef<
  HTMLDivElement,
  KeyframeTangentInteractionLayerProps
>(
  (
    {
      property,
      selectedClipOnly = true,
      selectedKeyframeOnly = true,
      rulerHeight = defaultTimelineInteractionGeometry.rulerHeight,
      trackHeight,
      collapsedTrackHeight,
      edgeThreshold,
      touchEdgeThreshold,
      overscanPixels,
      keyframeSize,
      tangentHandleSize,
      hitPadding = 8,
      keyframeValuePadding,
      onTangentHandleDoubleClick,
      getTangentHandleAriaLabel,
      onKeyDown,
      className = '',
      style,
      ...props
    },
    forwardedRef
  ) => {
    const engine = useTimelineEngine();
    const root = useRef<HTMLDivElement>(null);
    const [identity, setIdentity] = useState<string | null>(null);
    const geometry = useMemo(
      () => ({
        property,
        selectedClipOnly,
        selectedKeyframeOnly,
        rulerHeight,
        trackHeight,
        collapsedTrackHeight,
        edgeThreshold,
        touchEdgeThreshold,
        overscanPixels,
        keyframeSize,
        tangentHandleSize,
        keyframeValuePadding,
      }),
      [
        property,
        selectedClipOnly,
        selectedKeyframeOnly,
        rulerHeight,
        trackHeight,
        collapsedTrackHeight,
        edgeThreshold,
        touchEdgeThreshold,
        overscanPixels,
        keyframeSize,
        tangentHandleSize,
        keyframeValuePadding,
      ]
    );
    const segments = useTimelineKeyframeSegments(geometry);
    const drag = useTimelineKeyframeTangentDrag(geometry);
    const identify = (handle: TimelineKeyframeTangentHandle) =>
      JSON.stringify([handle.clip.id, handle.segmentId, handle.side]);
    const current =
      segments.visibleTangentHandles.find((handle) => identify(handle) === identity) ??
      segments.visibleTangentHandles[0];
    const cancelPointer = useKeyframePointer({
      root,
      rulerHeight,
      priority: 1,
      hitTest: (point) => {
        const candidates = segments.visibleTangentHandles.filter(
          ({ rect }) =>
            point.x >= rect.x - hitPadding &&
            point.x <= rect.x + rect.width + hitPadding &&
            point.y >= rect.y - hitPadding &&
            point.y <= rect.y + rect.height + hitPadding
        );
        candidates.sort(
          (a, b) =>
            Math.hypot(point.x - a.point.x, point.y - a.point.y) -
            Math.hypot(point.x - b.point.x, point.y - b.point.y)
        );
        return candidates[0] ?? null;
      },
      hover: (handle) => {
        if (handle && !drag.dragging) {
          setIdentity(identify(handle));
        }
      },
      start: (handle, point, event) => {
        setIdentity(identify(handle));
        if (!handle.canEdit) {
          return false;
        }
        engine.keyframes.selectKeyframes(
          [{ clipId: handle.clip.id, keyframeId: handle.anchorKeyframe.id }],
          'add'
        );
        if (onTangentHandleDoubleClick && consumeTimelineDoubleTap(event)) {
          onTangentHandleDoubleClick(handle, { engine, event });
          return false;
        }
        return drag.startKeyframeTangentDrag({
          tangentHandle: handle,
          viewportX: point.x,
          viewportY: point.y,
        }).ok;
      },
      move: (point) => {
        drag.moveKeyframeTangentDrag({ viewportX: point.x, viewportY: point.y });
      },
      end: (cancelled) => {
        if (cancelled) {
          drag.cancelKeyframeTangentDrag();
        } else {
          drag.endKeyframeTangentDrag();
        }
      },
    });
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelPointer();
        return;
      }
      if (!current) {
        return;
      }
      if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        const index = segments.visibleTangentHandles.indexOf(current);
        const next =
          segments.visibleTangentHandles[
            (index + (event.key === ']' ? 1 : segments.visibleTangentHandles.length - 1)) %
              segments.visibleTangentHandles.length
          ];
        if (next) {
          setIdentity(identify(next));
        }
        return;
      }
      if (!current.canEdit) {
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        engine.keyframes.updateClipKeyframeSide({
          clipId: current.clip.id,
          keyframeId: current.keyframe.id,
          side: current.side,
          patch: { handle: null },
        });
        return;
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        return;
      }
      event.preventDefault();
      const step = event.shiftKey ? 0.1 : event.altKey ? 0.001 : 0.01;
      const x = Math.max(
        0,
        Math.min(
          1,
          current.tangent.x +
            (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0)
        )
      );
      const y = Math.max(
        0,
        Math.min(
          1,
          current.tangent.y +
            (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0)
        )
      );
      engine.keyframes.updateClipKeyframeSide({
        clipId: current.clip.id,
        keyframeId: current.keyframe.id,
        side: current.side,
        patch: { interpolation: 'bezier', handle: { x, y } },
      });
    };
    const ref = useCallback(
      (node: HTMLDivElement | null) => {
        root.current = node;
        if (typeof forwardedRef === 'function') {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef]
    );
    const label = current
      ? (getTangentHandleAriaLabel?.(current) ??
        `${property} ${current.side} tangent, time ${Math.round(current.tangent.x * 100)} percent, value ${Math.round(current.tangent.y * 100)} percent`)
      : `${property} tangents`;
    return (
      <div
        {...props}
        ref={ref}
        className={`timeline-keyframe-tangent-interaction-layer ${className}`}
        role="group"
        tabIndex={current ? 0 : -1}
        aria-label={label}
        onKeyDown={handleKeyDown}
        style={{ top: rulerHeight, ...style }}
      >
        <span className="timeline-sr-only" aria-live="polite">
          {drag.dragging ? '' : label}
        </span>
        {current && (
          <>
            <svg className="timeline-keyframe-tangent-lines" aria-hidden="true">
              <line
                className="timeline-keyframe-tangent-line"
                x1={current.anchorPoint.x}
                y1={current.anchorPoint.y - rulerHeight}
                x2={current.point.x}
                y2={current.point.y - rulerHeight}
              />
            </svg>
            <div
              className="timeline-keyframe-tangent-handle"
              aria-hidden="true"
              data-keyframe-id={current.keyframe.id}
              data-side={current.side}
              data-active={drag.dragging ? 'true' : undefined}
              data-editable={current.canEdit ? 'true' : undefined}
              style={{
                transform: `translate(${current.rect.x - hitPadding}px, ${current.rect.y - rulerHeight - hitPadding}px)`,
                width: current.rect.width + hitPadding * 2,
                height: current.rect.height + hitPadding * 2,
              }}
            >
              <div
                className="timeline-keyframe-tangent-handle-shape"
                style={{ width: current.rect.width, height: current.rect.height }}
              />
            </div>
          </>
        )}
      </div>
    );
  }
);
KeyframeTangentInteractionLayer.displayName = 'Timeline.KeyframeTangentInteractionLayer';
