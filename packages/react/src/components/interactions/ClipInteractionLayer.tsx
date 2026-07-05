import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ClipHitRegion,
  ClipHitTestResult,
  ClipViewportRect,
  TimelineEngine,
  TimelineInteractionGeometry,
} from '@techsquidtv/canvas-timeline-core';
import { defaultTimelineInteractionGeometry } from '@techsquidtv/canvas-timeline-core';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import {
  useTimeline,
  useTimelineClipDrag,
  useTimelineClipNavigation,
  type TimelineClipNavigationOptions,
} from '../../hooks';
import { consumeTimelineDoubleTap } from './tapState';

interface OverlayState {
  clipId: string;
  region: ClipHitRegion;
  rect: ClipViewportRect;
  canMove: boolean;
  canTrim: boolean;
}

interface ActiveEdit {
  clipId: string;
  region: ClipHitRegion;
  startClientX: number;
  startLeft: number;
  startRight: number;
  dragging: boolean;
}

/**
 * Details passed to a clip double-click or double-tap callback.
 */
export interface ClipDoubleClickDetails {
  /** Timeline engine owning the hit clip. */
  engine: TimelineEngine;
  /** Timeline time under the pointer. */
  time: RationalTime;
  /** Pointer X in timeline viewport coordinates. */
  viewportX: number;
  /** Pointer Y in timeline viewport coordinates, including the ruler area. */
  viewportY: number;
  /** Original pointer event. */
  event: React.PointerEvent<HTMLDivElement>;
}

/**
 * Props for the delegated clip interaction layer.
 */
export interface ClipInteractionLayerProps
  extends
    Omit<React.HTMLAttributes<HTMLDivElement>, keyof TimelineInteractionGeometry>,
    TimelineInteractionGeometry {
  /**
   * Enables one focusable clip navigator for canvas-rendered clips.
   *
   * The layer handles keyboard input only while focused and never intercepts
   * `Tab`. Defaults to `true`.
   */
  keyboardNavigation?: boolean;
  /** Whether next/previous keyboard navigation wraps. Defaults to `false`. */
  clipNavigationWrap?: boolean;
  /** Whether keyboard navigation also selects clips in the engine. Defaults to `false`. */
  selectOnNavigate?: boolean;
  /** Optional externally controlled active clip id for the delegated overlay. */
  activeClipId?: string | null;
  /** Overlay region used for an externally controlled active clip. Defaults to `body`. */
  activeClipRegion?: ClipHitRegion;
  /** Whether the externally controlled active clip should render focus-visible styling. */
  activeClipFocusVisible?: boolean;
  /** Optional handler for double-click or double-tap gestures on canvas-rendered clips. */
  onClipDoubleClick?: (hit: ClipHitTestResult, details: ClipDoubleClickDetails) => void;
  /** Optional accessible label formatter for a canvas-rendered clip. */
  getClipAriaLabel?: TimelineClipNavigationOptions['getClipAriaLabel'];
  /** Optional accessible description formatter for a canvas-rendered clip. */
  getClipAriaDescription?: TimelineClipNavigationOptions['getClipAriaDescription'];
}

function getSelectedClipId(tracks: ReturnType<typeof useTimeline>['state']['tracks']) {
  for (const track of tracks) {
    const clip = track.clips.find((candidate) => candidate.selected);
    if (clip) {
      return clip.id;
    }
  }

  return null;
}

function overlayFromHit(hit: ClipHitTestResult): OverlayState {
  return {
    clipId: hit.clip.id,
    region: hit.region,
    rect: hit.rect,
    canMove: hit.canMove,
    canTrim: hit.canTrim,
  };
}

/**
 * Constant-DOM clip interaction surface for canvas-rendered timeline clips.
 */
export const ClipInteractionLayer = React.forwardRef<HTMLDivElement, ClipInteractionLayerProps>(
  (
    {
      className = '',
      style,
      rulerHeight = defaultTimelineInteractionGeometry.rulerHeight,
      trackHeight = defaultTimelineInteractionGeometry.trackHeight,
      collapsedTrackHeight = defaultTimelineInteractionGeometry.collapsedTrackHeight,
      edgeThreshold = defaultTimelineInteractionGeometry.edgeThreshold,
      touchEdgeThreshold = defaultTimelineInteractionGeometry.touchEdgeThreshold,
      keyboardNavigation = true,
      clipNavigationWrap = false,
      selectOnNavigate = false,
      activeClipId: controlledActiveClipId,
      activeClipRegion = 'body',
      activeClipFocusVisible,
      onClipDoubleClick,
      getClipAriaLabel,
      getClipAriaDescription,
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
    const { engine, state } = useTimeline();
    const internalRef = useRef<HTMLDivElement>(null);
    const activeEditRef = useRef<ActiveEdit | null>(null);
    const [hoveredClipId, setHoveredClipId] = useState<string | null>(null);
    const [hoveredRegion, setHoveredRegion] = useState<ClipHitRegion>('body');
    const [overlay, setOverlay] = useState<OverlayState | null>(null);
    const clipNavigation = useTimelineClipNavigation({
      wrap: clipNavigationWrap,
      selectOnNavigate,
      getClipAriaLabel,
      getClipAriaDescription,
    });
    const { cancelClipDrag, endClipDrag, moveClipDrag, startClipDrag } = useTimelineClipDrag({
      rulerHeight,
      trackHeight,
      collapsedTrackHeight,
      edgeThreshold,
      touchEdgeThreshold,
    });

    const geometry = useMemo(
      () => ({
        rulerHeight,
        trackHeight,
        collapsedTrackHeight,
        edgeThreshold,
        touchEdgeThreshold,
      }),
      [collapsedTrackHeight, edgeThreshold, rulerHeight, touchEdgeThreshold, trackHeight]
    );

    const selectedClipId = useMemo(() => getSelectedClipId(state.tracks), [state.tracks]);
    const keyboardActiveClipId = useMemo(
      () =>
        keyboardNavigation && clipNavigation.isFocusTargetFocused
          ? clipNavigation.activeClipId
          : null,
      [clipNavigation.activeClipId, clipNavigation.isFocusTargetFocused, keyboardNavigation]
    );
    const externalActiveClipId = useMemo(
      () => (controlledActiveClipId === undefined ? keyboardActiveClipId : controlledActiveClipId),
      [controlledActiveClipId, keyboardActiveClipId]
    );
    const targetClipId = useMemo(
      () =>
        activeEditRef.current?.clipId ?? hoveredClipId ?? externalActiveClipId ?? selectedClipId,
      [externalActiveClipId, hoveredClipId, selectedClipId]
    );
    const targetRegion = useMemo(
      () =>
        activeEditRef.current?.region ??
        (hoveredClipId ? hoveredRegion : externalActiveClipId ? activeClipRegion : 'body'),
      [activeClipRegion, externalActiveClipId, hoveredClipId, hoveredRegion]
    );

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
          y: event.clientY - rect.top + geometry.rulerHeight,
        };
      },
      [geometry.rulerHeight]
    );

    const refreshOverlay = useCallback(
      (clipId: string | null, region: ClipHitRegion = 'body') => {
        if (!clipId) {
          setOverlay(null);
          return;
        }

        const found = engine.getClip(clipId);
        const rect = engine.getClipRect(clipId, geometry);
        if (!found || !rect) {
          setOverlay(null);
          return;
        }

        setOverlay({
          clipId,
          region,
          rect,
          canMove: !found.track.locked && found.clip.movable !== false,
          canTrim: !found.track.locked && found.clip.resizable !== false,
        });
      },
      [engine, geometry]
    );

    useEffect(() => {
      refreshOverlay(targetClipId, targetRegion);
    }, [refreshOverlay, targetClipId, targetRegion]);

    useEffect(() => {
      const update = () => {
        refreshOverlay(activeEditRef.current?.clipId ?? targetClipId, targetRegion);
      };

      const unsubscribeRender = engine.on('render', update);

      return () => {
        unsubscribeRender();
      };
    }, [engine, refreshOverlay, targetClipId, targetRegion]);

    useEffect(() => {
      return () => {
        if (activeEditRef.current?.dragging) {
          if (activeEditRef.current.region === 'body') {
            cancelClipDrag();
          } else {
            engine.endDrag();
            engine.settle();
          }
        }
      };
    }, [cancelClipDrag, engine]);

    const handleActivePointerMove = useCallback(
      (event: PointerEvent) => {
        const activeEdit = activeEditRef.current;
        if (!activeEdit?.dragging) {
          return;
        }

        const deltaX = event.clientX - activeEdit.startClientX;
        if (activeEdit.region === 'start-edge') {
          engine.trimClip(
            activeEdit.clipId,
            'start',
            engine.pixelToTime(activeEdit.startLeft + deltaX)
          );
        } else if (activeEdit.region === 'end-edge') {
          engine.trimClip(
            activeEdit.clipId,
            'end',
            engine.pixelToTime(activeEdit.startRight + deltaX)
          );
        } else {
          const point = getViewportPoint(event);
          if (!point) {
            return;
          }
          moveClipDrag({
            clientX: event.clientX,
            viewportY: point.y,
          });
        }
      },
      [engine, getViewportPoint, moveClipDrag]
    );

    const stopActiveEdit = useCallback(
      (event: PointerEvent) => {
        const activeEdit = activeEditRef.current;
        activeEditRef.current = null;

        try {
          internalRef.current?.releasePointerCapture(event.pointerId);
        } catch {
          // Pointer capture may already be released by the browser.
        }

        if (activeEdit?.dragging) {
          if (activeEdit.region === 'body') {
            endClipDrag();
          } else {
            engine.endDrag();
            engine.settle();
          }
        }

        refreshOverlay(hoveredClipId ?? selectedClipId, hoveredRegion);
      },
      [endClipDrag, engine, hoveredClipId, hoveredRegion, refreshOverlay, selectedClipId]
    );

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
      onPointerMove?.(event);
      if (event.defaultPrevented) {
        return;
      }
      if (activeEditRef.current) {
        handleActivePointerMove(event.nativeEvent);
        return;
      }

      const point = getViewportPoint(event);
      const hit = point
        ? engine.getClipAtPoint({
            ...geometry,
            ...point,
            pointerType: event.pointerType,
          })
        : null;

      setHoveredClipId(hit?.clip.id ?? null);
      setHoveredRegion(hit?.region ?? 'body');
      setOverlay(hit ? overlayFromHit(hit) : null);
    };

    const handlePointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
      onPointerLeave?.(event);
      if (event.defaultPrevented || activeEditRef.current) {
        return;
      }

      setHoveredClipId(null);
      setHoveredRegion('body');
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
      onPointerUp?.(event);
      if (event.defaultPrevented || !activeEditRef.current) {
        return;
      }

      stopActiveEdit(event.nativeEvent);
    };

    const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
      onPointerCancel?.(event);
      if (event.defaultPrevented || !activeEditRef.current) {
        return;
      }

      stopActiveEdit(event.nativeEvent);
    };

    const handleLostPointerCapture = (event: React.PointerEvent<HTMLDivElement>) => {
      onLostPointerCapture?.(event);
      if (event.defaultPrevented || !activeEditRef.current) {
        return;
      }

      stopActiveEdit(event.nativeEvent);
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
      onPointerDown?.(event);
      if (event.defaultPrevented || (event.pointerType !== 'touch' && event.button !== 0)) {
        return;
      }

      const point = getViewportPoint(event);
      if (!point) {
        engine.selectClip(null);
        return;
      }

      const hit = engine.getClipAtPoint({
        ...geometry,
        ...point,
        pointerType: event.pointerType,
      });

      if (!hit) {
        engine.selectClip(null);
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.shiftKey) {
        engine.toggleClipSelection(hit.clip.id);
      } else {
        engine.selectClip(hit.clip.id);
      }
      clipNavigation.setActiveClip(hit.clip.id);
      setHoveredClipId(hit.clip.id);
      setHoveredRegion(hit.region);
      setOverlay(overlayFromHit(hit));

      if (onClipDoubleClick && consumeTimelineDoubleTap(event)) {
        onClipDoubleClick(hit, {
          engine,
          time: engine.pixelToTime(point.x),
          viewportX: point.x,
          viewportY: point.y,
          event,
        });
        return;
      }

      const shouldDrag =
        (hit.region === 'body' && hit.canMove) ||
        ((hit.region === 'start-edge' || hit.region === 'end-edge') && hit.canTrim);

      if (!shouldDrag) {
        return;
      }

      internalRef.current?.setPointerCapture(event.pointerId);
      if (hit.region === 'body') {
        startClipDrag({
          clipId: hit.clip.id,
          clientX: event.clientX,
          viewportY: point.y,
          clipRect: hit.rect,
        });
      } else {
        engine.prepareSnapping(hit.clip.id);
        engine.startDrag();
      }

      activeEditRef.current = {
        clipId: hit.clip.id,
        region: hit.region,
        startClientX: event.clientX,
        startLeft: hit.rect.x,
        startRight: hit.rect.x + hit.rect.width,
        dragging: true,
      };
    };

    const cursorRegion = overlay?.region ?? hoveredRegion;
    const isEditable = Boolean(overlay && (overlay.canMove || overlay.canTrim));
    const isKeyboardActiveOverlay =
      keyboardNavigation &&
      clipNavigation.isFocusTargetFocused &&
      overlay?.clipId === clipNavigation.activeClipId;
    const showFocusVisible = activeClipFocusVisible ?? isKeyboardActiveOverlay;
    const cursor = activeEditRef.current?.dragging
      ? 'grabbing'
      : cursorRegion === 'body'
        ? overlay?.canMove === false
          ? 'not-allowed'
          : 'grab'
        : overlay?.canTrim === false
          ? 'not-allowed'
          : 'ew-resize';
    const interactionLayerProps = keyboardNavigation
      ? clipNavigation.getFocusTargetProps<HTMLDivElement>(props)
      : props;

    return (
      <div
        ref={ref}
        className={`timeline-clip-interaction-layer ${className}`}
        data-has-target={overlay ? 'true' : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handleLostPointerCapture}
        style={{
          top: `${geometry.rulerHeight}px`,
          cursor: overlay ? cursor : undefined,
          ...style,
        }}
        {...interactionLayerProps}
      >
        {overlay && (
          <div
            className="timeline-clip-interaction-overlay"
            data-region={overlay.region}
            data-active={activeEditRef.current?.clipId === overlay.clipId ? 'true' : undefined}
            data-editable={isEditable ? 'true' : undefined}
            data-focus-visible={showFocusVisible ? 'true' : undefined}
            style={{
              transform: `translate(${overlay.rect.x}px, ${overlay.rect.y - geometry.rulerHeight}px)`,
              width: `${overlay.rect.width}px`,
              height: `${overlay.rect.height}px`,
            }}
          >
            {overlay.canTrim && (
              <>
                <div
                  className="timeline-clip-interaction-handle timeline-clip-interaction-handle-left"
                  data-active={activeEditRef.current?.region === 'start-edge' ? 'true' : undefined}
                />
                <div
                  className="timeline-clip-interaction-handle timeline-clip-interaction-handle-right"
                  data-active={activeEditRef.current?.region === 'end-edge' ? 'true' : undefined}
                />
              </>
            )}
            {isEditable && <div className="timeline-clip-interaction-feedback" />}
          </div>
        )}
      </div>
    );
  }
);

ClipInteractionLayer.displayName = 'Timeline.ClipInteractionLayer';
