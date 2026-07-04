import { useCallback, useMemo } from 'react';
import type {
  TimelineKeyframe,
  TimelineKeyframeGeometryOptions,
  TimelineKeyframeProperty,
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
  timelineCommandOk,
  type TimelineCommandResult,
} from '../core/timelineCommandResult';

/** Options accepted by `useTimelineKeyframes`. */
export interface UseTimelineKeyframesOptions extends TimelineKeyframeGeometryOptions {
  /** Optional clip id used to scope keyframe lists and commands. */
  clipId?: string;
}

/** Result returned by `useTimelineKeyframes`. */
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
    property: TimelineKeyframeProperty,
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
 * @param options - Optional clip/property filters and renderer-aligned geometry settings.
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
    (targetClipId: string, targetProperty: TimelineKeyframeProperty, time?: RationalTime) =>
      engine.getClipPropertyValueAtTime(targetClipId, targetProperty, time),
    [engine]
  );

  const setKeyframe = useCallback(
    (
      input: TimelineSetClipKeyframeOptions,
      mutationOptions?: TimelineKeyframeMutationOptions
    ): TimelineCommandResult<TimelineKeyframe> => {
      const found = engine.getClip(input.clipId);
      const keyframe = engine.setClipKeyframe(input, mutationOptions);
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
      const keyframe = engine.updateClipKeyframe(input, mutationOptions);
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
        if (keyframe.easing) {
          removedKeyframe.easing = { ...keyframe.easing };
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
