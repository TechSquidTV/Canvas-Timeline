import { timelineCommandFail, timelineCommandOk } from '@techsquidtv/canvas-timeline-core';
import type {
  TimelineCommandResult,
  TimelineInteractionGeometry,
  TimelineKeyframeRect,
  TimelineKeyframeEditCommand,
  TimelineReadonly,
  TimelineKeyframe,
  Clip,
  TimelineRegisteredKeyframePropertyDefinition,
} from '@techsquidtv/canvas-timeline-core';
import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import {
  addRational,
  fromSeconds,
  subRational,
  toSeconds,
  resolveTimecodeFrameRate,
} from '@techsquidtv/canvas-timeline-utils';
import type { RationalTime, TimecodeFrameRate } from '@techsquidtv/canvas-timeline-utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
/** Pointer data needed to begin a keyframe drag. */
export interface TimelineKeyframeDragStartInput {
  /** Clip owning the keyframe. */
  clipId: string;
  /** Keyframe being dragged. */
  keyframeId: string;
  /** Pointer client X captured at drag start. */
  clientX: number;
  /** Pointer Y in timeline viewport coordinates, including the ruler area. */
  viewportY: number;
  /** Optional keyframe rect from the initiating hit test. */
  keyframeRect?: TimelineKeyframeRect;
}

/** Pointer data needed to update a keyframe drag. */
export interface TimelineKeyframeDragMoveInput {
  /** Constrain movement to one axis. */
  axis?: 'time' | 'value';
  /** Reduce movement to one tenth for precision edits. */
  fine?: boolean;
  /** Temporarily bypass snapping. */
  snap?: boolean;
  /** Current pointer client X. */
  clientX: number;
  /** Current pointer Y in timeline viewport coordinates, including the ruler area. */
  viewportY: number;
}

/**
 * Options accepted by `useTimelineKeyframeDrag`.
 *
 * @remarks
 *
 * Geometry must match the renderer or keyframe interaction layer so horizontal
 * pointer movement maps to timeline time and vertical movement maps to property
 * value consistently. The hook edits values in preview mode while dragging and
 * settles history when the drag ends.
 *
 * @see {@link useTimelineKeyframes}
 * @see {@link https://canvastimeline.com/docs/keyframes | Keyframes}
 */
export interface UseTimelineKeyframeDragOptions extends TimelineInteractionGeometry {
  /** Frame grid; defaults to the engine frame rate, or 30 fps when unset. */
  frameRate?: TimecodeFrameRate;
  /** Keyframe affordance size in CSS pixels. Defaults to engine geometry. */
  keyframeSize?: number;
  /** Vertical padding used when mapping property values into a clip row. Defaults to engine geometry. */
  keyframeValuePadding?: number;
}

/** Result returned by `useTimelineKeyframeDrag`. */
export interface UseTimelineKeyframeDragResult {
  /** Whether a keyframe drag is currently active. */
  dragging: boolean;
  /** Starts a keyframe drag. */
  startKeyframeDrag: (input: TimelineKeyframeDragStartInput) => TimelineCommandResult;
  /** Updates the active keyframe drag preview. */
  moveKeyframeDrag: (
    input: TimelineKeyframeDragMoveInput
  ) => TimelineCommandResult<TimelineKeyframeDragUpdate>;
  /** Ends the active keyframe drag and settles history. */
  endKeyframeDrag: () => TimelineCommandResult;
  /** Cancels the drag and restores the committed state without an undo entry. */
  cancelKeyframeDrag: () => TimelineCommandResult;
}

/** Successful keyframe drag update payload. */
export interface TimelineKeyframeDragUpdate {
  /** Clip owning the keyframe. */
  clipId: string;
  /** Keyframe being dragged. */
  keyframeId: string;
  /** Updated timeline time. */
  time: RationalTime;
  /** Updated property value. */
  value: number;
}

interface ActiveKeyframeDrag {
  clipId: string;
  keyframeId: string;
  startClientX: number;
  startY: number;
  time: RationalTime;
  valueHeight: number;
  entries: {
    clipId: string;
    keyframeId: string;
    key: TimelineReadonly<TimelineKeyframe>;
    clip: TimelineReadonly<Clip>;
    normalized: number;
    definition: TimelineRegisteredKeyframePropertyDefinition;
  }[];
}

/**
 * Headless keyframe drag behavior shared by canvas and custom timeline UIs.
 *
 * @remarks
 *
 * Use this hook when building custom DOM or canvas hit targets for keyframe
 * points. The hook owns drag lifecycle, preview updates, value mapping, and
 * settle behavior. It intentionally does not render handles; pair it with
 * {@link useTimelineKeyframeGeometry} for keyframe geometry.
 *
 * @param options - Drag geometry aligned with the renderer and hit-test layer.
 * @returns Keyframe drag state and pointer command helpers.
 *
 * @example
 * ```tsx
 * import { useTimelineKeyframeDrag } from '@techsquidtv/canvas-timeline-react';
 *
 * export function KeyframeHandle({ clipId, keyframeId }: { clipId: string; keyframeId: string }) {
 *   const drag = useTimelineKeyframeDrag();
 *
 *   return (
 *     <button
 *       type="button"
 *       aria-pressed={drag.dragging}
 *       onPointerDown={(event) =>
 *         drag.startKeyframeDrag({
 *           clipId,
 *           keyframeId,
 *           clientX: event.clientX,
 *           viewportY: event.nativeEvent.offsetY,
 *         })
 *       }
 *     >
 *       Move keyframe
 *     </button>
 *   );
 * }
 * ```
 *
 * @see {@link useTimelineKeyframes}
 * @see {@link https://canvastimeline.com/demos/keyframe-opacity | Keyframe opacity demo}
 */
export function useTimelineKeyframeDrag(
  options: UseTimelineKeyframeDragOptions = {}
): UseTimelineKeyframeDragResult {
  const engine = useTimelineEngine();
  const activeDragRef = useRef<ActiveKeyframeDrag | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(
    () => () => {
      if (activeDragRef.current) {
        engine.cancelEdit();
      }
    },
    [engine]
  );

  const startKeyframeDrag = useCallback(
    (input: TimelineKeyframeDragStartInput): TimelineCommandResult => {
      const found = engine.geometry.getClip(input.clipId);
      const key = found?.clip.keyframes?.find((candidate) => candidate.id === input.keyframeId);
      const rect = engine.geometry.getClipRect(input.clipId, options);
      if (!found || !key || !rect) {
        return timelineCommandFail('not-found');
      }
      if (found.track.locked) {
        return timelineCommandFail('locked');
      }
      if (![input.clientX, input.viewportY].every(Number.isFinite)) {
        return timelineCommandFail('invalid-input');
      }
      const references = key.selected
        ? engine.keyframes.getSelectedKeyframes()
        : [{ clipId: input.clipId, keyframeId: input.keyframeId }];
      const entries = references.flatMap((ref) => {
        const owner = engine.geometry.getClip(ref.clipId);
        const candidate = owner?.clip.keyframes?.find((item) => item.id === ref.keyframeId);
        const definition = candidate
          ? engine.getKeyframePropertyDefinition(candidate.property)
          : null;
        return owner && candidate && definition
          ? [
              {
                ...ref,
                key: candidate,
                clip: owner.clip,
                definition,
                normalized: definition.normalizeValue(candidate.value),
              },
            ]
          : [];
      });
      engine.cancelEdit();
      activeDragRef.current = {
        clipId: input.clipId,
        keyframeId: input.keyframeId,
        startClientX: input.clientX,
        startY: input.viewportY,
        time: key.time,
        entries,
        valueHeight: Math.max(1, rect.height - 2 * (options.keyframeValuePadding ?? 7)),
      };
      setDragging(true);
      return timelineCommandOk();
    },
    [engine, options]
  );

  const moveKeyframeDrag = useCallback(
    (input: TimelineKeyframeDragMoveInput): TimelineCommandResult<TimelineKeyframeDragUpdate> => {
      const active = activeDragRef.current;
      if (!active) {
        return timelineCommandFail('unsupported');
      }
      if (![input.clientX, input.viewportY].every(Number.isFinite)) {
        return timelineCommandFail('invalid-input');
      }
      const sensitivity = input.fine ? 0.1 : 1;
      let seconds =
        input.axis === 'value'
          ? 0
          : ((input.clientX - active.startClientX) / engine.zoomScale) * sensitivity;
      let valueDelta =
        input.axis === 'time'
          ? 0
          : ((active.startY - input.viewportY) / active.valueHeight) * sensitivity;
      if (input.axis !== 'value' && input.snap !== false && engine.getState().snapEnabled) {
        const target = toSeconds(active.time) + seconds;
        const frameRate = options.frameRate ?? engine.frameRate ?? 30;
        const fps = resolveTimecodeFrameRate(frameRate);
        let snapped = Math.round(target * fps) / fps;
        let distance = Math.abs(snapped - target) * engine.zoomScale;
        const selected = new Set(
          active.entries.map((entry) => JSON.stringify([entry.clipId, entry.keyframeId]))
        );
        const candidates = [
          engine.getState().playheadTime,
          ...(engine.getState().markers ?? []).map((marker) => marker.time),
        ];
        for (const track of engine.getState().tracks) {
          for (const clip of track.clips) {
            candidates.push(clip.timelineStart, clip.timelineEnd);
            for (const key of clip.keyframes ?? []) {
              if (!selected.has(JSON.stringify([clip.id, key.id]))) {
                candidates.push(key.time);
              }
            }
          }
        }
        for (const time of candidates) {
          const pixels = Math.abs(toSeconds(time) - target) * engine.zoomScale;
          if (pixels <= engine.getState().snapThresholdPixels && pixels <= distance) {
            snapped = toSeconds(time);
            distance = pixels;
          }
        }
        seconds = snapped - toSeconds(active.time);
      }
      for (const entry of active.entries) {
        seconds = Math.max(
          toSeconds(subRational(entry.clip.timelineStart, entry.key.time)),
          Math.min(toSeconds(subRational(entry.clip.timelineEnd, entry.key.time)), seconds)
        );
        valueDelta = Math.max(-entry.normalized, Math.min(1 - entry.normalized, valueDelta));
      }
      const command: TimelineKeyframeEditCommand = {
        type: 'keyframes',
        edits: active.entries.map((entry) => ({
          type: 'update',
          clipId: entry.clipId,
          keyframeId: entry.keyframeId,
          time: addRational(entry.key.time, fromSeconds(seconds)),
          value: entry.definition.denormalizeValue(entry.normalized + valueDelta),
        })),
      };
      const preview = engine.previewEdit(command);
      if (!preview.valid) {
        return timelineCommandFail(
          preview.reason === 'locked' ? 'locked' : 'invalid-input',
          preview.message
        );
      }
      const key = preview.changedClips
        .find((clip) => clip.id === active.clipId)
        ?.keyframes?.find((candidate) => candidate.id === active.keyframeId);
      if (!key) {
        return timelineCommandFail('not-found');
      }
      return timelineCommandOk({
        clipId: active.clipId,
        keyframeId: active.keyframeId,
        time: key.time,
        value: key.value,
      });
    },
    [engine, options.frameRate]
  );

  const finish = useCallback(
    (commit: boolean): TimelineCommandResult => {
      if (!activeDragRef.current) {
        return timelineCommandFail('unsupported');
      }
      activeDragRef.current = null;
      setDragging(false);
      const preview = engine.getEditPreview();
      let ok = true;
      if (commit && preview?.valid && preview.command.type === 'keyframes') {
        ok = engine.commitEdit(preview.command).committed;
      }
      engine.cancelEdit();
      return ok ? timelineCommandOk() : timelineCommandFail('invalid-input');
    },
    [engine]
  );
  const endKeyframeDrag = useCallback(() => finish(true), [finish]);
  const cancelKeyframeDrag = useCallback(() => finish(false), [finish]);
  return useMemo(
    () => ({ dragging, startKeyframeDrag, moveKeyframeDrag, endKeyframeDrag, cancelKeyframeDrag }),
    [dragging, startKeyframeDrag, moveKeyframeDrag, endKeyframeDrag, cancelKeyframeDrag]
  );
}
