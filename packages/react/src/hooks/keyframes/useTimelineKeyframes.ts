import {
  timelineCommandFail,
  timelineCommandInvalidInput,
  timelineCommandOk,
} from '@techsquidtv/canvas-timeline-core';
import type {
  TimelineCommandResult,
  TimelineKeyframe,
  TimelineKeyframeReference,
  TimelineKeyframeClipboard,
  TimelineKeyframeEditCommand,
  TimelineKeyframeMutationOptions,
  TimelineKeyframePropertyId,
  TimelineSetClipKeyframeOptions,
  TimelineUpdateClipKeyframeOptions,
} from '@techsquidtv/canvas-timeline-core';
import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { useTimelineSelector } from '#react/hooks/core/useTimelineSelector';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useCallback, useMemo } from 'react';
/**
 * Options accepted by `useTimelineKeyframes`.
 *
 * @remarks
 *
 * Use these options to scope keyframe reads to one clip, one property, selected
 * clips. Use useTimelineKeyframeGeometry for live viewport-space reads.
 *
 * @see {@link useTimelineKeyframeDrag}
 * @see {@link https://canvastimeline.com/docs/keyframes | Keyframes}
 */
export interface UseTimelineKeyframesOptions {
  /** Optional property filter. */
  property?: TimelineKeyframePropertyId;
  /** Restrict state to selected clips. */
  selectedClipOnly?: boolean;
  /** Optional clip id used to scope keyframe lists and commands. */
  clipId?: string;
}

/**
 * Result returned by `useTimelineKeyframes`.
 *
 * @remarks
 *
 * The result combines settled keyframe lists, selection, and mutation commands.
 * Use it for keyframe inspectors,
 * property editors, and toolbar actions. For pointer-driven dragging, combine
 * it with {@link useTimelineKeyframeDrag}; for Bezier easing handles, combine
 * it with {@link useTimelineKeyframeTangentDrag}.
 *
 *
 * @see {@link useTimelineKeyframeTangentDrag}
 * @see {@link https://canvastimeline.com/docs/keyframes | Keyframes}
 */
export interface UseTimelineKeyframesResult {
  /** Settled keyframes matching the clip, property, and selection filters. */
  keyframes: TimelineKeyframe[];
  /** Evaluates a keyframed property at a timeline time. */
  getPropertyValueAtTime: (
    clipId: string,
    property: TimelineKeyframePropertyId,
    time?: RationalTime
  ) => number | undefined;
  /** Adds or updates one keyframe by clip, property, and exact timeline time. */
  setKeyframe: (
    input: TimelineSetClipKeyframeOptions,
    options?: TimelineKeyframeMutationOptions
  ) => TimelineCommandResult<TimelineKeyframe>;
  /** Updates one existing keyframe. */
  updateKeyframe: (
    input: TimelineUpdateClipKeyframeOptions,
    options?: TimelineKeyframeMutationOptions
  ) => TimelineCommandResult<TimelineKeyframe>;
  /** Removes one keyframe from a clip. */
  removeKeyframe: (
    clipId: string,
    keyframeId: string,
    options?: TimelineKeyframeMutationOptions
  ) => TimelineCommandResult<TimelineKeyframe>;
  /** Selects keys without subscribing to live geometry. */
  selectKeyframes: (
    references: readonly TimelineKeyframeReference[],
    mode?: 'replace' | 'add' | 'toggle'
  ) => TimelineCommandResult;
  /** Selected keys across all clips. */
  selectedKeyframes: TimelineKeyframeReference[];
  /** Copies the current selection independently of clip copy/paste. */
  copyKeyframes: () => TimelineKeyframeClipboard;
  /** Creates a paste command with preserved relative timing. */
  createPasteCommand: (
    clipboard: TimelineKeyframeClipboard,
    time: RationalTime,
    clipId?: string
  ) => TimelineKeyframeEditCommand;
  /** Clears keyframe selection. */
  clearKeyframeSelection: () => TimelineCommandResult;
}

/**
 * Reads settled keyframe state and exposes canonical keyframe commands.
 *
 * @remarks
 *
 * `useTimelineKeyframes` is the main keyframe-domain hook. It reads settled keyframe state. Use useTimelineKeyframeGeometry for live overlays. Mutation commands return
 * {@link TimelineCommandResult} values and respect locked tracks.
 *
 * @param options - Optional clip, property, and selected-clip filters.
 * @returns Settled keyframe lists, selection, property evaluation, and mutation commands.
 *
 * @example
 * ```tsx
 * import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
 * import { useTimelineKeyframes } from '@techsquidtv/canvas-timeline-react';
 *
 * export function OpacityKeyframeButton({ clipId }: { clipId: string }) {
 *   const keyframes = useTimelineKeyframes({ clipId, property: 'opacity' });
 *
 *   return (
 *     <button
 *       type="button"
 *       onClick={() =>
 *         keyframes.setKeyframe({
 *           clipId,
 *           property: 'opacity',
 *           time: fromSeconds(1),
 *           value: 0.5,
 *         })
 *       }
 *     >
 *       Add opacity keyframe
 *     </button>
 *   );
 * }
 * ```
 *
 * @see {@link useTimelineKeyframeDrag}
 * @see {@link useTimelineKeyframeTangentDrag}
 * @see {@link https://canvastimeline.com/demos/keyframe-opacity | Keyframe opacity demo}
 */
export function useTimelineKeyframes(
  options: UseTimelineKeyframesOptions = {}
): UseTimelineKeyframesResult {
  const engine = useTimelineEngine();
  const tracks = useTimelineSelector((state) => state.tracks);
  const keyframes = useMemo(
    () =>
      tracks.flatMap((track) =>
        track.clips
          .filter(
            (clip) =>
              (options.clipId === undefined || clip.id === options.clipId) &&
              (!options.selectedClipOnly || clip.selected)
          )
          .flatMap((clip) =>
            (clip.keyframes ?? []).filter(
              (key) => options.property === undefined || key.property === options.property
            )
          )
      ),
    [tracks, options.clipId, options.property, options.selectedClipOnly]
  );
  const selectedKeyframes = useMemo(
    () =>
      tracks.flatMap((track) =>
        track.clips.flatMap((clip) =>
          (clip.keyframes ?? [])
            .filter((key) => key.selected)
            .map((key) => ({ clipId: clip.id, keyframeId: key.id }))
        )
      ),
    [tracks]
  );
  const copyKeyframes = useCallback(() => engine.keyframes.copyKeyframes(), [engine]);
  const createPasteCommand = useCallback(
    (clipboard: TimelineKeyframeClipboard, time: RationalTime, clipId?: string) =>
      engine.keyframes.createPasteCommand(clipboard, time, clipId),
    [engine]
  );

  const getPropertyValueAtTime = useCallback(
    (targetClipId: string, targetProperty: TimelineKeyframePropertyId, time?: RationalTime) =>
      engine.keyframes.getClipPropertyValueAtTime(targetClipId, targetProperty, time),
    [engine]
  );

  const setKeyframe = useCallback(
    (
      input: TimelineSetClipKeyframeOptions,
      mutationOptions?: TimelineKeyframeMutationOptions
    ): TimelineCommandResult<TimelineKeyframe> => {
      const found = engine.geometry.getClip(input.clipId);
      let keyframe: TimelineKeyframe | null;
      try {
        keyframe = engine.keyframes.setClipKeyframe(input, mutationOptions);
      } catch (setError: unknown) {
        return timelineCommandInvalidInput(
          'Timeline keyframe could not be created from the provided input.',
          setError
        );
      }
      if (keyframe) {
        return timelineCommandOk(keyframe);
      }
      if (!found) {
        return timelineCommandFail('not-found');
      }
      return found.track.locked ? timelineCommandFail('locked') : timelineCommandFail('not-found');
    },
    [engine]
  );

  const updateKeyframe = useCallback(
    (
      input: TimelineUpdateClipKeyframeOptions,
      mutationOptions?: TimelineKeyframeMutationOptions
    ): TimelineCommandResult<TimelineKeyframe> => {
      const found = engine.geometry.getClip(input.clipId);
      let keyframe: TimelineKeyframe | null;
      try {
        keyframe = engine.keyframes.updateClipKeyframe(input, mutationOptions);
      } catch (updateError: unknown) {
        return timelineCommandInvalidInput(
          'Timeline keyframe could not be updated from the provided input.',
          updateError
        );
      }
      if (keyframe) {
        return timelineCommandOk(keyframe);
      }

      if (!found) {
        return timelineCommandFail('not-found');
      }
      return found.track.locked ? timelineCommandFail('locked') : timelineCommandFail('not-found');
    },
    [engine]
  );

  const removeKeyframe = useCallback(
    (
      targetClipId: string,
      keyframeId: string,
      mutationOptions?: TimelineKeyframeMutationOptions
    ): TimelineCommandResult<TimelineKeyframe> => {
      const found = engine.geometry.getClip(targetClipId);
      const keyframe = found?.clip.keyframes?.find((candidate) => candidate.id === keyframeId);
      const removed = engine.keyframes.removeClipKeyframe(
        targetClipId,
        keyframeId,
        mutationOptions
      );
      if (removed && keyframe) {
        const removedKeyframe: TimelineKeyframe = {
          ...keyframe,
          time: { ...keyframe.time },
        };
        if (keyframe.incoming) {
          removedKeyframe.incoming = { ...keyframe.incoming };
        }
        if (keyframe.outgoing) {
          removedKeyframe.outgoing = { ...keyframe.outgoing };
        }
        return timelineCommandOk(removedKeyframe);
      }

      if (!found) {
        return timelineCommandFail('not-found');
      }
      return found.track.locked ? timelineCommandFail('locked') : timelineCommandFail('not-found');
    },
    [engine]
  );

  const selectKeyframes = useCallback(
    (references: readonly TimelineKeyframeReference[], mode?: 'replace' | 'add' | 'toggle') =>
      engine.keyframes.selectKeyframes(references, mode),
    [engine]
  );

  const clearKeyframeSelection = useCallback((): TimelineCommandResult => {
    engine.keyframes.clearKeyframeSelection();
    return timelineCommandOk();
  }, [engine]);

  return useMemo(
    () => ({
      keyframes,
      getPropertyValueAtTime,
      setKeyframe,
      updateKeyframe,
      removeKeyframe,
      selectKeyframes,
      selectedKeyframes,
      copyKeyframes,
      createPasteCommand,
      clearKeyframeSelection,
    }),
    [
      clearKeyframeSelection,
      getPropertyValueAtTime,
      keyframes,
      removeKeyframe,
      selectKeyframes,
      selectedKeyframes,
      copyKeyframes,
      createPasteCommand,
      setKeyframe,
      updateKeyframe,
    ]
  );
}
