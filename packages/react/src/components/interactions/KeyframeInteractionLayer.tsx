import { consumeTimelineDoubleTap } from '#react/components/interactions/tapState';
import { useKeyframePointer } from '#react/components/interactions/useKeyframePointer';
import { useTimelineKeyframeDrag, useTimelineKeyframeGeometry } from '#react/hooks';
import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { defaultTimelineInteractionGeometry } from '@techsquidtv/canvas-timeline-core';
import type {
  TimelineEngine,
  TimelineInteractionGeometry,
  TimelineKeyframeHitTestResult,
  TimelineKeyframePropertyId,
  TimelineKeyframeRect,
  TimelineKeyframeReference,
  TimelineKeyframeClipboard,
  TimelineKeyframeEditCommand,
} from '@techsquidtv/canvas-timeline-core';
import {
  addRational,
  fromSeconds,
  toSeconds,
  resolveTimecodeFrameRate,
} from '@techsquidtv/canvas-timeline-utils';
import type { TimecodeFrameRate } from '@techsquidtv/canvas-timeline-utils';
import React, { useCallback, useMemo, useRef, useState } from 'react';
/**
 * Details passed to a keyframe double-click or double-tap callback.
 */
export interface KeyframeDoubleClickDetails {
  /** Timeline engine owning the keyframe. */
  engine: TimelineEngine;
  /** Original pointer event. */
  event: PointerEvent;
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
  /** Keyframe property to render and hit-test. */
  property: TimelineKeyframePropertyId;
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
  /** Keyboard nudge amount in seconds for left/right arrow keys. Defaults to one frame at the configured frame rate. */
  keyboardStepSeconds?: number;
  /** Frame rate for snapping and keyboard nudges; defaults to the engine configuration. */
  frameRate?: TimecodeFrameRate;
  /** Normalized value change for up/down arrow nudges. Defaults to one percent. */
  keyboardValueStep?: number;
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

type PointerTarget = { type: 'key'; entry: TimelineKeyframeRect } | { type: 'marquee' };
interface Marquee {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Delegated keyframe editing with one focus target and one active affordance. */
export const KeyframeInteractionLayer = React.forwardRef<
  HTMLDivElement,
  KeyframeInteractionLayerProps
>(
  (
    {
      property,
      selectedClipOnly = false,
      rulerHeight = defaultTimelineInteractionGeometry.rulerHeight,
      trackHeight,
      collapsedTrackHeight,
      edgeThreshold,
      touchEdgeThreshold,
      overscanPixels,
      keyframeSize,
      keyframeValuePadding,
      hitPadding = 8,
      keyboardStepSeconds,
      keyboardValueStep = 0.01,
      frameRate,
      onKeyframeDoubleClick,
      onKeyframeDelete,
      getKeyframeAriaLabel,
      onKeyDown,
      className = '',
      style,
      ...props
    },
    forwardedRef
  ) => {
    const engine = useTimelineEngine();
    const root = useRef<HTMLDivElement>(null);
    const [focused, setFocused] = useState<TimelineKeyframeReference | null>(null);
    const [marquee, setMarquee] = useState<Marquee | null>(null);
    const marqueeRef = useRef<{
      x: number;
      y: number;
      selection: TimelineKeyframeReference[];
      additive: boolean;
    } | null>(null);
    const keyPointerRef = useRef<{
      reference: TimelineKeyframeReference;
      toggleOnClick: boolean;
      moved: boolean;
    } | null>(null);
    const axisRef = useRef<'time' | 'value' | undefined>(undefined);
    const originRef = useRef({ x: 0, y: 0 });
    const clipboard = useRef<TimelineKeyframeClipboard | null>(null);
    const geometry = useMemo(
      () => ({
        property,
        selectedClipOnly,
        rulerHeight,
        trackHeight,
        collapsedTrackHeight,
        edgeThreshold,
        touchEdgeThreshold,
        overscanPixels,
        keyframeSize,
        keyframeValuePadding,
      }),
      [
        property,
        selectedClipOnly,
        rulerHeight,
        trackHeight,
        collapsedTrackHeight,
        edgeThreshold,
        touchEdgeThreshold,
        overscanPixels,
        keyframeSize,
        keyframeValuePadding,
      ]
    );
    const live = useTimelineKeyframeGeometry(geometry);
    const drag = useTimelineKeyframeDrag({ ...geometry, frameRate });
    const current =
      live.keyframeRects.find(
        (entry) => entry.clip.id === focused?.clipId && entry.keyframe.id === focused.keyframeId
      ) ??
      live.keyframeRects.find((entry) => entry.keyframe.selected) ??
      live.visibleKeyframes[0];
    const setFocus = (entry: TimelineKeyframeRect) =>
      setFocused({ clipId: entry.clip.id, keyframeId: entry.keyframe.id });
    const cancelPointer = useKeyframePointer<PointerTarget>({
      root,
      rulerHeight,
      hitTest: (point, event) => {
        const hits = live.visibleKeyframes.filter(
          ({ rect }) =>
            point.x >= rect.x - hitPadding &&
            point.x <= rect.x + rect.width + hitPadding &&
            point.y >= rect.y - hitPadding &&
            point.y <= rect.y + rect.height + hitPadding
        );
        hits.sort(
          (a, b) =>
            Math.hypot(
              point.x - a.rect.x - a.rect.width / 2,
              point.y - a.rect.y - a.rect.height / 2
            ) -
            Math.hypot(
              point.x - b.rect.x - b.rect.width / 2,
              point.y - b.rect.y - b.rect.height / 2
            )
        );
        return hits[0]
          ? { type: 'key', entry: hits[0] }
          : event.shiftKey && point.y >= rulerHeight
            ? { type: 'marquee' }
            : null;
      },
      hover: (target) => {
        if (target?.type === 'key' && !drag.dragging) {
          setFocus(target.entry);
        }
      },
      start: (target, point, event) => {
        originRef.current = point;
        axisRef.current = undefined;
        if (target.type === 'marquee') {
          marqueeRef.current = {
            ...point,
            selection: engine.keyframes.getSelectedKeyframes(),
            additive: event.metaKey || event.ctrlKey,
          };
          setMarquee({ ...point, width: 0, height: 0 });
          return true;
        }
        const entry = target.entry;
        setFocus(entry);
        if (!entry.canEdit) {
          return false;
        }
        const ref = { clipId: entry.clip.id, keyframeId: entry.keyframe.id };
        const additive = event.shiftKey || event.metaKey || event.ctrlKey;
        keyPointerRef.current = {
          reference: ref,
          toggleOnClick: additive && Boolean(entry.keyframe.selected),
          moved: false,
        };
        if (!entry.keyframe.selected) {
          engine.keyframes.selectKeyframes([ref], additive ? 'add' : 'replace');
        }
        if (onKeyframeDoubleClick && consumeTimelineDoubleTap(event)) {
          keyPointerRef.current = null;
          onKeyframeDoubleClick(entry, { engine, event });
          return false;
        }
        const started = drag.startKeyframeDrag({
          ...ref,
          clientX: event.clientX,
          viewportY: point.y,
          keyframeRect: entry,
        }).ok;
        if (!started) {
          keyPointerRef.current = null;
        }
        return started;
      },
      move: (point, event) => {
        const start = marqueeRef.current;
        if (start) {
          const box = {
            x: Math.min(start.x, point.x),
            y: Math.min(start.y, point.y),
            width: Math.abs(point.x - start.x),
            height: Math.abs(point.y - start.y),
          };
          setMarquee(box);
          const selected = live.keyframeRects
            .filter(
              (entry) =>
                entry.canEdit &&
                entry.rect.x + entry.rect.width >= box.x &&
                entry.rect.x <= box.x + box.width &&
                entry.rect.y + entry.rect.height >= box.y &&
                entry.rect.y <= box.y + box.height
            )
            .map((entry) => ({ clipId: entry.clip.id, keyframeId: entry.keyframe.id }));
          engine.keyframes.selectKeyframes(
            start.additive ? [...start.selection, ...selected] : selected
          );
          return;
        }
        const keyPointer = keyPointerRef.current;
        if (!keyPointer) {
          return;
        }
        if (!keyPointer.moved) {
          if (Math.hypot(point.x - originRef.current.x, point.y - originRef.current.y) < 3) {
            return;
          }
          keyPointer.moved = true;
        }
        if (event.shiftKey && !axisRef.current) {
          axisRef.current =
            Math.abs(point.x - originRef.current.x) >= Math.abs(point.y - originRef.current.y)
              ? 'time'
              : 'value';
        }
        drag.moveKeyframeDrag({
          clientX: event.clientX,
          viewportY: point.y,
          axis: event.shiftKey ? axisRef.current : undefined,
          fine: event.altKey,
          snap: !(event.ctrlKey || event.metaKey),
        });
      },
      end: (cancelled) => {
        if (marqueeRef.current) {
          if (cancelled) {
            engine.keyframes.selectKeyframes(marqueeRef.current.selection);
          }
          marqueeRef.current = null;
          setMarquee(null);
        } else {
          const keyPointer = keyPointerRef.current;
          keyPointerRef.current = null;
          if (cancelled) {
            drag.cancelKeyframeDrag();
          } else {
            const result = drag.endKeyframeDrag();
            if (result.ok && keyPointer?.toggleOnClick && !keyPointer.moved) {
              engine.keyframes.selectKeyframes([keyPointer.reference], 'toggle');
            }
          }
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
      const modifier = event.metaKey || event.ctrlKey;
      const selected = engine.keyframes.getSelectedKeyframes();
      const references = selected.length
        ? selected
        : [{ clipId: current.clip.id, keyframeId: current.keyframe.id }];
      if (modifier && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        engine.keyframes.selectKeyframes(
          live.keyframeRects
            .filter((entry) => entry.canEdit)
            .map((entry) => ({ clipId: entry.clip.id, keyframeId: entry.keyframe.id }))
        );
        return;
      }
      if (modifier && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        clipboard.current = engine.keyframes.copyKeyframes(references);
        return;
      }
      if (modifier && (event.key.toLowerCase() === 'v' || event.key.toLowerCase() === 'd')) {
        event.preventDefault();
        const copied =
          event.key.toLowerCase() === 'd'
            ? engine.keyframes.copyKeyframes(references)
            : clipboard.current;
        if (copied) {
          engine.commitEdit(
            engine.keyframes.createPasteCommand(
              copied,
              event.key.toLowerCase() === 'd'
                ? addRational(
                    current.keyframe.time,
                    fromSeconds(
                      keyboardStepSeconds ??
                        1 / resolveTimecodeFrameRate(frameRate ?? engine.frameRate ?? 30)
                    )
                  )
                : engine.getState().playheadTime
            )
          );
        }
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        if (onKeyframeDelete) {
          onKeyframeDelete(current, { engine, event });
        } else {
          engine.commitEdit({
            type: 'keyframes',
            edits: references.map((ref) => ({ type: 'remove', ...ref })),
          });
        }
        return;
      }
      if (event.key === '[' || event.key === ']' || event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        const entries = live.keyframeRects;
        const index = entries.indexOf(current);
        const next =
          entries[
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? entries.length - 1
                : Math.max(0, Math.min(entries.length - 1, index + (event.key === ']' ? 1 : -1)))
          ];
        if (next) {
          setFocus(next);
          engine.keyframes.selectKeyframes(
            [{ clipId: next.clip.id, keyframeId: next.keyframe.id }],
            event.shiftKey ? 'add' : 'replace'
          );
          engine.updatePlayhead(next.keyframe.time);
        }
        return;
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        return;
      }
      event.preventDefault();
      const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : -1;
      const multiplier = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
      const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
      const step =
        keyboardStepSeconds ?? 1 / resolveTimecodeFrameRate(frameRate ?? engine.frameRate ?? 30);
      let valueDelta = keyboardValueStep * direction * multiplier;
      for (const ref of references) {
        const key = engine.keyframes
          .getClipKeyframes(ref.clipId)
          .find((candidate) => candidate.id === ref.keyframeId);
        const definition = key ? engine.getKeyframePropertyDefinition(key.property) : null;
        if (key && definition) {
          const normalized = definition.normalizeValue(key.value);
          valueDelta = Math.max(-normalized, Math.min(1 - normalized, valueDelta));
        }
      }
      const command: TimelineKeyframeEditCommand = {
        type: 'keyframes',
        edits: references.flatMap((ref) => {
          const key = engine.keyframes
            .getClipKeyframes(ref.clipId)
            .find((candidate) => candidate.id === ref.keyframeId);
          const definition = key ? engine.getKeyframePropertyDefinition(key.property) : null;
          if (!key || !definition) {
            return [];
          }
          return [
            {
              type: 'update',
              ...ref,
              ...(horizontal
                ? { time: addRational(key.time, fromSeconds(step * direction * multiplier)) }
                : {
                    value: definition.denormalizeValue(
                      Math.max(0, Math.min(1, definition.normalizeValue(key.value) + valueDelta))
                    ),
                  }),
            },
          ];
        }),
      };
      engine.commitEdit(command);
    };
    const label = current
      ? (getKeyframeAriaLabel?.(current) ??
        `${property} keyframe at ${toSeconds(current.keyframe.time).toFixed(3)} seconds, ${engine.getKeyframePropertyDefinition(property)?.formatValue?.(current.keyframe.value) ?? current.keyframe.value}`)
      : `${property} keyframes`;
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
    return (
      <div
        {...props}
        ref={ref}
        className={`timeline-keyframe-interaction-layer ${className}`}
        role="group"
        tabIndex={0}
        aria-label={label}
        onKeyDown={handleKeyDown}
        style={{ top: rulerHeight, ...style }}
      >
        <span className="timeline-sr-only" aria-live="polite">
          {drag.dragging ? '' : label}
        </span>
        {current && (
          <div
            className="timeline-keyframe-handle"
            aria-hidden="true"
            data-clip-id={current.clip.id}
            data-keyframe-id={current.keyframe.id}
            data-selected={current.keyframe.selected ? 'true' : undefined}
            data-active={drag.dragging ? 'true' : undefined}
            data-editable={current.canEdit ? 'true' : undefined}
            style={{
              transform: `translate(${current.rect.x - hitPadding}px, ${current.rect.y - rulerHeight - hitPadding}px)`,
              width: current.rect.width + hitPadding * 2,
              height: current.rect.height + hitPadding * 2,
            }}
          >
            <div
              className="timeline-keyframe-handle-shape"
              style={{ width: current.rect.width, height: current.rect.height }}
            />
          </div>
        )}
        {marquee && (
          <div
            className="timeline-keyframe-marquee"
            style={{
              left: marquee.x,
              top: marquee.y - rulerHeight,
              width: marquee.width,
              height: marquee.height,
            }}
          />
        )}
      </div>
    );
  }
);
KeyframeInteractionLayer.displayName = 'Timeline.KeyframeInteractionLayer';
