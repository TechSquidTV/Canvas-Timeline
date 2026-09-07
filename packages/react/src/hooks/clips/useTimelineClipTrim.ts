import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { runTimelineCommand } from '#react/hooks/core/runTimelineCommand';
import { TimelineEditGesture } from '#react/hooks/editing/timelineEditGesture';
import { timelineCommandFail, timelineCommandOk } from '@techsquidtv/canvas-timeline-core';
import type {
  TimelineCommandResult,
  TimelineEditPreview,
  TimelineTrimEditCommand,
} from '@techsquidtv/canvas-timeline-core';
import { addRational, fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Data captured when a clip edge starts a pointer trim. */
export interface TimelineClipTrimStartInput {
  /** Clip whose edge will move. */
  clipId: string;
  /** Edge being trimmed. */
  edge: TimelineTrimEditCommand['edge'];
  /** Initial horizontal client coordinate. */
  clientX: number;
}

/** Result returned by `useTimelineClipTrim`. */
export interface UseTimelineClipTrimResult {
  /** Whether this hook owns an active trim gesture. */
  trimming: boolean;
  /** Captures the clip edge and zoom, and prepares snapping. */
  startClipTrim: (input: TimelineClipTrimStartInput) => TimelineCommandResult;
  /** Publishes a non-mutating preview using the captured start geometry. */
  moveClipTrim: (
    input: Pick<TimelineClipTrimStartInput, 'clientX'>
  ) => TimelineCommandResult<TimelineEditPreview>;
  /** Revalidates and commits this gesture as one undo step. A click alone creates no edit. */
  endClipTrim: () => TimelineCommandResult;
  /** Discards this gesture's preview and snap guides without changing the document. */
  cancelClipTrim: () => TimelineCommandResult;
}

interface ActiveTrim extends TimelineClipTrimStartInput {
  startTime: RationalTime;
  zoomScale: number;
  gesture: TimelineEditGesture;
}

/**
 * Headless pointer trimming for custom DOM or canvas clip edges.
 *
 * Capture the pointer on your element after a successful start; forward moves,
 * pointer up, and cancellation to the corresponding commands. The hook captures
 * start geometry once, delegates snapping and edit policy to Core, and cancels
 * its preview on unmount. It has no DOM or per-frame state subscription.
 * Compose with `useTimelineEditPreview` for live preview UI.
 *
 * @returns Trim gesture state and start, move, commit, and cancel commands.
 * @example
 * ```tsx
 * const trim = useTimelineClipTrim();
 * return <button
 *   aria-label="Trim clip end"
 *   onPointerDown={(event) => {
 *     if (trim.startClipTrim({ clipId: 'clip', edge: 'end', clientX: event.clientX }).ok) {
 *       event.currentTarget.setPointerCapture(event.pointerId);
 *     }
 *   }}
 *   onPointerMove={(event) => { trim.moveClipTrim({ clientX: event.clientX }); }}
 *   onPointerUp={() => { trim.endClipTrim(); }}
 *   onPointerCancel={() => { trim.cancelClipTrim(); }}
 *   onLostPointerCapture={() => { trim.cancelClipTrim(); }}
 * />;
 * ```
 */
export function useTimelineClipTrim(): UseTimelineClipTrimResult {
  const engine = useTimelineEngine();
  const activeRef = useRef<ActiveTrim | null>(null);
  const [trimming, setTrimming] = useState(false);

  useEffect(
    () => () => {
      const active = activeRef.current;
      activeRef.current = null;
      if (active) {
        active.gesture.cancel();
        setTrimming(false);
      }
    },
    [engine]
  );

  const startClipTrim = useCallback(
    (input: TimelineClipTrimStartInput): TimelineCommandResult => {
      if (activeRef.current) {
        return timelineCommandFail('unsupported', 'A trim is already active.');
      }
      if (!Number.isFinite(input.clientX) || (input.edge !== 'start' && input.edge !== 'end')) {
        return timelineCommandFail('invalid-input');
      }
      const found = engine.geometry.getClip(input.clipId);
      if (!found) {
        return timelineCommandFail('not-found');
      }
      if (found.track.locked || found.clip.resizable === false) {
        return timelineCommandFail('locked');
      }
      engine.cancelEdit();
      engine.prepareSnapping({ ignoreClipId: input.clipId, operation: 'trim' });
      activeRef.current = {
        ...input,
        startTime: {
          ...(input.edge === 'start' ? found.clip.timelineStart : found.clip.timelineEnd),
        },
        zoomScale: engine.zoomScale,
        gesture: new TimelineEditGesture(engine),
      };
      setTrimming(true);
      return timelineCommandOk();
    },
    [engine]
  );

  const moveClipTrim = useCallback(
    (
      input: Pick<TimelineClipTrimStartInput, 'clientX'>
    ): TimelineCommandResult<TimelineEditPreview> =>
      runTimelineCommand(() => {
        const active = activeRef.current;
        if (!active) {
          return timelineCommandFail('unsupported');
        }
        if (!Number.isFinite(input.clientX)) {
          return timelineCommandFail('invalid-input');
        }
        if (!active.gesture.isCurrent()) {
          return timelineCommandFail('unsupported', 'The trim preview was replaced.');
        }
        const preview = active.gesture.publish({
          type: 'trim',
          overwrite: true,
          clipId: active.clipId,
          edge: active.edge,
          newTime: addRational(
            active.startTime,
            fromSeconds((input.clientX - active.clientX) / active.zoomScale, active.startTime.r)
          ),
        });
        return preview.valid
          ? timelineCommandOk(preview)
          : timelineCommandFail(preview.reason ?? 'unsupported', preview.message);
      }),
    []
  );

  const endClipTrim = useCallback((): TimelineCommandResult => {
    const active = activeRef.current;
    if (!active) {
      return timelineCommandFail('unsupported');
    }
    activeRef.current = null;
    setTrimming(false);
    return active.gesture.commit();
  }, []);

  const cancelClipTrim = useCallback((): TimelineCommandResult => {
    const active = activeRef.current;
    if (!active) {
      return timelineCommandFail('unsupported');
    }
    activeRef.current = null;
    setTrimming(false);
    active.gesture.cancel();
    return timelineCommandOk();
  }, []);

  return useMemo(
    () => ({ trimming, startClipTrim, moveClipTrim, endClipTrim, cancelClipTrim }),
    [trimming, startClipTrim, moveClipTrim, endClipTrim, cancelClipTrim]
  );
}
