import { useCallback, useMemo } from 'react';
import type {
  TimelineKeyframe,
  TimelineKeyframeGeometryOptions,
  TimelineKeyframePropertyId,
  TimelineKeyframeRect,
  TimelineKeyframeMutationOptions,
  TimelineSetClipKeyframeOptions,
  TimelineUpdateClipKeyframeOptions,
  VisibleTimelineKeyframe,
} from '@techsquidtv/canvas-timeline-core';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useTimeline } from '../core/useTimeline';
import { useTimelineGeometryRevision } from '../core/useTimelineGeometryRevision';
import {
  timelineCommandFail,
  timelineCommandInvalidInput,
  timelineCommandOk,
  type TimelineCommandResult,
} from '../core/timelineCommandResult';

/**
 * Options accepted by `useTimelineKeyframes`.
 *
 * @remarks
 *
 * Use these options to scope keyframe reads to one clip, one property, selected
 * clips, or visible viewport geometry. Geometry options should match the
 * renderer and interaction layer so DOM overlays line up with canvas keyframe
 * diamonds.
 *
 * @see {@link useTimelineKeyframeDrag}
 * @see {@link https://canvastimeline.com/docs/keyframes | Keyframes}
 */
export interface UseTimelineKeyframesOptions extends TimelineKeyframeGeometryOptions {
  /** Optional clip id used to scope keyframe lists and commands. */
  clipId?: string;
}

/**
 * Result returned by `useTimelineKeyframes`.
 *
 * @remarks
 *
 * The result combines keyframe lists, viewport geometry, visible geometry, and
 * mutation commands. Use it for keyframe inspectors, custom DOM overlays,
 * property editors, and toolbar actions. For pointer-driven dragging, combine
 * it with {@link useTimelineKeyframeDrag}; for Bezier easing handles, use
 * {@link useTimelineKeyframeCurves}.
 *
 * @template TrackKind - App-defined track kind values carried by returned track
 * entries.
 *
 * @see {@link useTimelineKeyframeCurves}
 * @see {@link https://canvastimeline.com/docs/keyframes | Keyframes}
 */
export interface UseTimelineKeyframesResult<TrackKind = string> {
  /** Clip-scoped keyframes for `clipId`, or all keyframes from visible rects when no clip is scoped. */
  keyframes: TimelineKeyframe[];
  /** Viewport-space keyframe geometry in track order. */
  keyframeRects: TimelineKeyframeRect<TrackKind>[];
  /** Viewport-intersecting keyframe geometry in track order. */
  visibleKeyframes: VisibleTimelineKeyframe<TrackKind>[];
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
  /** Selects one keyframe, or clears keyframe selection when ids are null. */
  selectKeyframe: (clipId: string | null, keyframeId: string | null) => TimelineCommandResult;
  /** Clears keyframe selection. */
  clearKeyframeSelection: () => TimelineCommandResult;
}

/**
 * Reads timeline keyframe geometry and exposes canonical keyframe commands.
 *
 * @remarks
 *
 * `useTimelineKeyframes` is the main keyframe-domain hook. It reads geometry
 * from the engine so custom overlays share the same clip, track, scroll, and
 * zoom math as the canvas renderer. Mutation commands return
 * {@link TimelineCommandResult} values and respect locked tracks.
 *
 * @param options - Optional clip/property filters and renderer-aligned geometry settings.
 * @template TrackKind - App-defined track kind values carried by returned track
 * entries.
 * @returns Keyframe lists, viewport geometry, visible geometry, property evaluation, and mutation commands.
 *
 * @example
 * ```tsx
 * import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
 * import { useTimelineKeyframes } from '@techsquidtv/canvas-timeline-react/hooks';
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
 * @example
 * ```tsx
 * import { useTimelineKeyframes } from '@techsquidtv/canvas-timeline-react/hooks';
 *
 * export function SelectedKeyframeOverlay() {
 *   const { keyframeRects } = useTimelineKeyframes({ selectedClipOnly: true });
 *
 *   return keyframeRects.map((entry) => (
 *     <span
 *       key={entry.keyframe.id}
 *       style={{ left: entry.x, top: entry.y, width: entry.width, height: entry.height }}
 *     />
 *   ));
 * }
 * ```
 *
 * @see {@link useTimelineKeyframeDrag}
 * @see {@link useTimelineKeyframeCurves}
 * @see {@link https://canvastimeline.com/demos/keyframe-opacity | Keyframe opacity demo}
 */
export function useTimelineKeyframes<TrackKind = string>(
  options: UseTimelineKeyframesOptions = {}
): UseTimelineKeyframesResult<TrackKind> {
  const { engine } = useTimeline();
  const revision = useTimelineGeometryRevision({ redrawOnPreview: true });
  const {
    clipId,
    collapsedTrackHeight,
    edgeThreshold,
    keyframeSize,
    keyframeValuePadding,
    overscanPixels,
    property,
    rulerHeight,
    selectedClipOnly,
    touchEdgeThreshold,
    trackHeight,
    viewportHeight,
    viewportWidth,
  } = options;

  const geometry = useMemo(
    () => ({
      collapsedTrackHeight,
      edgeThreshold,
      keyframeSize,
      keyframeValuePadding,
      overscanPixels,
      property,
      rulerHeight,
      selectedClipOnly,
      touchEdgeThreshold,
      trackHeight,
      viewportHeight,
      viewportWidth,
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
      touchEdgeThreshold,
      trackHeight,
      viewportHeight,
      viewportWidth,
    ]
  );

  const keyframeRects = useMemo(() => {
    void revision;
    return engine
      .getKeyframeRects<TrackKind>(geometry)
      .filter((entry) => clipId === undefined || entry.clip.id === clipId);
  }, [clipId, engine, geometry, revision]);

  const visibleKeyframes = useMemo(() => {
    void revision;
    return engine
      .getVisibleKeyframes<TrackKind>(geometry)
      .filter((entry) => clipId === undefined || entry.clip.id === clipId);
  }, [clipId, engine, geometry, revision]);

  const keyframes = useMemo(() => {
    if (clipId !== undefined) {
      return engine.getClipKeyframes(clipId, property);
    }

    return keyframeRects.map((entry) => entry.keyframe);
  }, [clipId, engine, keyframeRects, property]);

  const getPropertyValueAtTime = useCallback(
    (targetClipId: string, targetProperty: TimelineKeyframePropertyId, time?: RationalTime) =>
      engine.getClipPropertyValueAtTime(targetClipId, targetProperty, time),
    [engine]
  );

  const setKeyframe = useCallback(
    (
      input: TimelineSetClipKeyframeOptions,
      mutationOptions?: TimelineKeyframeMutationOptions
    ): TimelineCommandResult<TimelineKeyframe> => {
      const found = engine.getClip(input.clipId);
      let keyframe: TimelineKeyframe | null;
      try {
        keyframe = engine.setClipKeyframe(input, mutationOptions);
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
      const found = engine.getClip(input.clipId);
      let keyframe: TimelineKeyframe | null;
      try {
        keyframe = engine.updateClipKeyframe(input, mutationOptions);
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
      const found = engine.getClip(targetClipId);
      const keyframe = found?.clip.keyframes?.find((candidate) => candidate.id === keyframeId);
      const removed = engine.removeClipKeyframe(targetClipId, keyframeId, mutationOptions);
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

  const selectKeyframe = useCallback(
    (targetClipId: string | null, keyframeId: string | null): TimelineCommandResult => {
      if (targetClipId !== null && keyframeId !== null) {
        const found = engine.getClip(targetClipId);
        if (!found?.clip.keyframes?.some((keyframe) => keyframe.id === keyframeId)) {
          return timelineCommandFail('not-found');
        }
      }

      engine.selectClipKeyframe(targetClipId, keyframeId);
      return timelineCommandOk();
    },
    [engine]
  );

  const clearKeyframeSelection = useCallback((): TimelineCommandResult => {
    engine.clearKeyframeSelection();
    return timelineCommandOk();
  }, [engine]);

  return useMemo(
    () => ({
      keyframes,
      keyframeRects,
      visibleKeyframes,
      getPropertyValueAtTime,
      setKeyframe,
      updateKeyframe,
      removeKeyframe,
      selectKeyframe,
      clearKeyframeSelection,
    }),
    [
      clearKeyframeSelection,
      getPropertyValueAtTime,
      keyframeRects,
      keyframes,
      removeKeyframe,
      selectKeyframe,
      setKeyframe,
      updateKeyframe,
      visibleKeyframes,
    ]
  );
}
