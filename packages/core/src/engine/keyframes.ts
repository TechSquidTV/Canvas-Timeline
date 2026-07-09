import type {
  ClipKeyframeChangeEvent,
  ClipKeyframeRemoveEvent,
  ClipKeyframeSelectEvent,
} from '#core/events';
import {
  defaultTimelineIncomingBezierHandle,
  defaultTimelineOutgoingBezierHandle,
  getTimelineKeyframeBezierControlPoints,
  getTimelineKeyframeInterpolationProgress,
  getTimelineKeyframeValuePoint,
  normalizeTimelineKeyframeBezierHandle,
  normalizeTimelineKeyframeInterpolation,
  normalizeTimelineKeyframeSideInterpolation,
} from '#core/keyframes';
import { cloneRationalTime, cloneTimelineKeyframe, sortTimelineKeyframes } from '#core/snapshot';
import type {
  Clip,
  ClipViewportRect,
  TimelineClipGeometryOptions,
  TimelineKeyframe,
  TimelineKeyframeGeometryOptions,
  TimelineKeyframeHitTestInput,
  TimelineKeyframeHitTestResult,
  TimelineKeyframeMutationOptions,
  TimelineKeyframePoint,
  TimelineKeyframePropertyId,
  TimelineKeyframeRect,
  TimelineKeyframeRenderClip,
  TimelineKeyframeRenderGeometry,
  TimelineKeyframeRenderGeometryOptions,
  TimelineKeyframeRenderPoint,
  TimelineKeyframeRenderSegment,
  TimelineKeyframeSegment,
  TimelineKeyframeSegmentGeometryOptions,
  TimelineKeyframeSide,
  TimelineKeyframeSidePatch,
  TimelineKeyframeTangentHandle,
  TimelineKeyframeTangentHandleHitTestResult,
  TimelineKeyframeTangentHitTestInput,
  TimelineRegisteredKeyframePropertyDefinition,
  TimelineSetClipKeyframeOptions,
  TimelineUpdateClipKeyframeOptions,
  TimelineUpdateClipKeyframeSideOptions,
  TimelineUpdateClipKeyframeSidesOptions,
  Track,
  VisibleTimelineKeyframe,
  VisibleTimelineKeyframeSegment,
} from '#core/types';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import {
  assertValidRationalTime,
  compareRational,
  maxRational,
  minRational,
  subRational,
  toSeconds,
} from '@techsquidtv/canvas-timeline-utils';
import type { TimelineClipLookup } from '#core/engine/types';
import { clampViewportCoordinate, defaultTimelineViewportWidth } from '#core/engine/geometry';
import { TimelineEngineEditing } from '#core/engine/editing';

function isSameRationalTime(left: RationalTime, right: RationalTime) {
  return compareRational(left, right) === 0;
}

export abstract class TimelineEngineKeyframes extends TimelineEngineEditing {
  abstract override getClip(clipId: string): TimelineClipLookup | undefined;
  abstract timeToPixel(time: RationalTime): number;
  protected abstract forEachTimelineClipGeometry<TrackKind>(
    options: TimelineClipGeometryOptions,
    visit: (
      track: Track<TrackKind>,
      clip: Clip,
      trackIndex: number,
      clipIndex: number,
      rect: ClipViewportRect
    ) => void
  ): void;

  protected resolveClip(clipIdOrClip: string | Clip): Clip | undefined {
    return typeof clipIdOrClip === 'string' ? this.getClip(clipIdOrClip)?.clip : clipIdOrClip;
  }

  /**
   * Returns keyframes owned by one clip, optionally filtered by property.
   */
  getClipKeyframes(clipId: string, property?: TimelineKeyframePropertyId): TimelineKeyframe[] {
    const clip = this.getClip(clipId)?.clip;
    if (clip?.keyframes === undefined) {
      return [];
    }

    return clip.keyframes.filter(
      (keyframe) => property === undefined || keyframe.property === property
    );
  }

  /**
   * Evaluates a keyframed clip property at a timeline time.
   */
  getClipPropertyValueAtTime(
    clipIdOrClip: string | Clip,
    property: TimelineKeyframePropertyId,
    timelineTime: RationalTime = this.state.playheadTime
  ): number | undefined {
    const clip = this.resolveClip(clipIdOrClip);
    const definition = this.getRequiredKeyframePropertyDefinition(property);
    if (
      clip === undefined ||
      definition === null ||
      compareRational(timelineTime, clip.timelineStart) < 0 ||
      compareRational(timelineTime, clip.timelineEnd) > 0
    ) {
      return undefined;
    }

    const fallback = definition.getBaseValue
      ? this.keyframeProperties.clampDefinitionValue(
          definition,
          definition.getBaseValue(clip),
          `keyframe property "${property}" base value`
        )
      : definition.defaultValue;
    const keyframes = (clip.keyframes ?? [])
      .filter((keyframe) => keyframe.property === property)
      .filter(
        (keyframe) =>
          compareRational(keyframe.time, clip.timelineStart) >= 0 &&
          compareRational(keyframe.time, clip.timelineEnd) <= 0
      );
    sortTimelineKeyframes(keyframes);

    if (keyframes.length === 0) {
      return fallback;
    }

    const first = keyframes[0];
    const last = keyframes[keyframes.length - 1];
    if (compareRational(timelineTime, first.time) <= 0) {
      return this.keyframeProperties.clampDefinitionValue(
        definition,
        first.value,
        'keyframe value'
      );
    }
    if (compareRational(timelineTime, last.time) >= 0) {
      return this.keyframeProperties.clampDefinitionValue(definition, last.value, 'keyframe value');
    }

    const exact = keyframes.find((keyframe) => isSameRationalTime(keyframe.time, timelineTime));
    if (exact !== undefined) {
      return this.keyframeProperties.clampDefinitionValue(
        definition,
        exact.value,
        'keyframe value'
      );
    }

    for (let index = 0; index < keyframes.length - 1; index++) {
      const left = keyframes[index];
      const right = keyframes[index + 1];
      if (
        compareRational(timelineTime, left.time) >= 0 &&
        compareRational(timelineTime, right.time) <= 0
      ) {
        const outgoing = normalizeTimelineKeyframeSideInterpolation(
          left.outgoing,
          defaultTimelineOutgoingBezierHandle
        );
        const incoming = normalizeTimelineKeyframeSideInterpolation(
          right.incoming,
          defaultTimelineIncomingBezierHandle
        );
        const interpolation =
          outgoing.interpolation === 'hold'
            ? 'hold'
            : outgoing.interpolation === 'bezier' || incoming.interpolation === 'bezier'
              ? 'bezier'
              : 'linear';
        if (interpolation === 'hold') {
          return this.keyframeProperties.clampDefinitionValue(
            definition,
            left.value,
            'keyframe value'
          );
        }
        const spanSeconds = toSeconds(subRational(right.time, left.time));
        if (spanSeconds <= 0) {
          return this.keyframeProperties.clampDefinitionValue(
            definition,
            right.value,
            'keyframe value'
          );
        }
        const progress = toSeconds(subRational(timelineTime, left.time)) / spanSeconds;
        const easedProgress = getTimelineKeyframeInterpolationProgress(
          interpolation,
          progress,
          outgoing.handle,
          incoming.handle
        );
        const leftNormalized = this.keyframeProperties.normalizeDefinitionValue(
          definition,
          left.value,
          'left keyframe value'
        );
        const rightNormalized = this.keyframeProperties.normalizeDefinitionValue(
          definition,
          right.value,
          'right keyframe value'
        );
        const normalizedValue = leftNormalized + (rightNormalized - leftNormalized) * easedProgress;
        return this.keyframeProperties.denormalizeDefinitionValue(
          definition,
          normalizedValue,
          'interpolated keyframe value'
        );
      }
    }

    return fallback;
  }

  /**
   * Adds or updates one keyframe by clip, property, and exact timeline time.
   *
   * New keyframes created without explicit side interpolation use normalized
   * linear defaults during evaluation.
   */
  setClipKeyframe(
    input: TimelineSetClipKeyframeOptions,
    options: TimelineKeyframeMutationOptions = {}
  ): TimelineKeyframe | null {
    assertValidRationalTime(input.time, 'input.time');
    const found = this.getClip(input.clipId);
    if (!found || found.track.locked) {
      return null;
    }
    const value = this.clampKeyframeValue(input.property, input.value);
    if (value === null) {
      return null;
    }

    const time = this.clampKeyframeTimeToClip(found.clip, input.time);
    found.clip.keyframes ??= [];
    const existing = found.clip.keyframes.find(
      (keyframe) => keyframe.property === input.property && isSameRationalTime(keyframe.time, time)
    );
    const eventName = existing === undefined ? 'keyframe:add' : 'keyframe:update';

    const keyframe =
      existing ??
      ({
        id: crypto.randomUUID(),
        property: input.property,
        time,
        value,
      } satisfies TimelineKeyframe);

    keyframe.time = cloneRationalTime(time);
    keyframe.value = value;
    if (input.incoming !== undefined) {
      keyframe.incoming = normalizeTimelineKeyframeSideInterpolation(
        input.incoming,
        defaultTimelineIncomingBezierHandle
      );
    }
    if (input.outgoing !== undefined) {
      keyframe.outgoing = normalizeTimelineKeyframeSideInterpolation(
        input.outgoing,
        defaultTimelineOutgoingBezierHandle
      );
    }

    if (existing === undefined) {
      found.clip.keyframes.push(keyframe);
    }
    this.normalizeClipKeyframes(found.clip);
    this.emit(eventName, {
      clipId: input.clipId,
      keyframe: cloneTimelineKeyframe(keyframe),
    } satisfies ClipKeyframeChangeEvent);
    this.commitKeyframeMutation(options);
    return keyframe;
  }

  /**
   * Updates an existing keyframe.
   *
   * Committed updates merge keyframes that land on the same property and
   * time. Preview updates (`{ commit: false }`) never delete a colliding
   * neighbor; the keyframe keeps its current time instead, so drag previews
   * stay non-destructive.
   */
  updateClipKeyframe(
    input: TimelineUpdateClipKeyframeOptions,
    options: TimelineKeyframeMutationOptions = {}
  ): TimelineKeyframe | null {
    const found = this.getClip(input.clipId);
    if (!found || found.track.locked || found.clip.keyframes === undefined) {
      return null;
    }

    const keyframe = found.clip.keyframes.find((candidate) => candidate.id === input.keyframeId);
    if (keyframe === undefined) {
      return null;
    }

    if (input.time !== undefined) {
      assertValidRationalTime(input.time, 'input.time');
    }
    let nextTime =
      input.time === undefined
        ? keyframe.time
        : this.clampKeyframeTimeToClip(found.clip, input.time);

    const collision = found.clip.keyframes.find(
      (candidate) =>
        candidate.id !== keyframe.id &&
        candidate.property === keyframe.property &&
        isSameRationalTime(candidate.time, nextTime)
    );
    if (collision !== undefined) {
      if (options.commit === false) {
        // Preview updates (drags) must not destroy neighboring keyframes.
        nextTime = keyframe.time;
      } else {
        found.clip.keyframes = found.clip.keyframes.filter((candidate) => candidate !== collision);
      }
    }

    keyframe.time = cloneRationalTime(nextTime);
    if (input.value !== undefined) {
      const value = this.clampKeyframeValue(keyframe.property, input.value);
      if (value === null) {
        return null;
      }
      keyframe.value = value;
    }
    if (input.incoming !== undefined) {
      keyframe.incoming = normalizeTimelineKeyframeSideInterpolation(
        input.incoming,
        defaultTimelineIncomingBezierHandle
      );
    }
    if (input.outgoing !== undefined) {
      keyframe.outgoing = normalizeTimelineKeyframeSideInterpolation(
        input.outgoing,
        defaultTimelineOutgoingBezierHandle
      );
    }

    this.normalizeClipKeyframes(found.clip);
    this.emit('keyframe:update', {
      clipId: input.clipId,
      keyframe: cloneTimelineKeyframe(keyframe),
    } satisfies ClipKeyframeChangeEvent);
    this.commitKeyframeMutation(options);
    return keyframe;
  }

  /**
   * Updates one side of an existing keyframe.
   */
  updateClipKeyframeSide(
    input: TimelineUpdateClipKeyframeSideOptions,
    options: TimelineKeyframeMutationOptions = {}
  ): TimelineKeyframe | null {
    return this.updateClipKeyframeSides(
      {
        clipId: input.clipId,
        keyframeId: input.keyframeId,
        [input.side]: input.patch,
      },
      options
    );
  }

  /**
   * Updates one or both sides of an existing keyframe.
   */
  updateClipKeyframeSides(
    input: TimelineUpdateClipKeyframeSidesOptions,
    options: TimelineKeyframeMutationOptions = {}
  ): TimelineKeyframe | null {
    const found = this.getClip(input.clipId);
    if (!found || found.track.locked || found.clip.keyframes === undefined) {
      return null;
    }

    const keyframe = found.clip.keyframes.find((candidate) => candidate.id === input.keyframeId);
    if (keyframe === undefined || !this.keyframeProperties.has(keyframe.property)) {
      return null;
    }

    const patches: Array<[TimelineKeyframeSide, TimelineKeyframeSidePatch | undefined]> = [
      ['incoming', input.incoming],
      ['outgoing', input.outgoing],
    ];
    if (patches.every(([, patch]) => patch === undefined)) {
      return null;
    }

    for (const [side, patch] of patches) {
      if (patch === undefined) {
        continue;
      }
      const fallback =
        side === 'incoming'
          ? defaultTimelineIncomingBezierHandle
          : defaultTimelineOutgoingBezierHandle;
      const current = normalizeTimelineKeyframeSideInterpolation(keyframe[side], fallback);
      const nextInterpolation = normalizeTimelineKeyframeInterpolation(
        patch.interpolation ?? current.interpolation
      );
      const nextHandle = patch.handle === null ? undefined : (patch.handle ?? current.handle);
      keyframe[side] = normalizeTimelineKeyframeSideInterpolation(
        {
          interpolation: nextInterpolation,
          handle: nextHandle,
        },
        fallback
      );
    }

    this.normalizeClipKeyframes(found.clip);
    this.emit('keyframe:update', {
      clipId: input.clipId,
      keyframe: cloneTimelineKeyframe(keyframe),
    } satisfies ClipKeyframeChangeEvent);
    this.commitKeyframeMutation(options);
    return keyframe;
  }

  /**
   * Removes a keyframe from one clip.
   */
  removeClipKeyframe(
    clipId: string,
    keyframeId: string,
    options: TimelineKeyframeMutationOptions = {}
  ): boolean {
    const found = this.getClip(clipId);
    if (!found || found.track.locked || found.clip.keyframes === undefined) {
      return false;
    }

    const keyframeIndex = found.clip.keyframes.findIndex((keyframe) => keyframe.id === keyframeId);
    if (keyframeIndex === -1) {
      return false;
    }

    const [removed] = found.clip.keyframes.splice(keyframeIndex, 1);
    this.emit('keyframe:remove', {
      clipId,
      keyframe: cloneTimelineKeyframe(removed),
    } satisfies ClipKeyframeRemoveEvent);
    this.commitKeyframeMutation(options);
    return true;
  }

  /**
   * Selects one keyframe and clears all other keyframe selections.
   */
  selectClipKeyframe(clipId: string | null, keyframeId: string | null) {
    let selectedKeyframe: TimelineKeyframe | null = null;
    for (const track of this.state.tracks) {
      for (const clip of track.clips) {
        for (const keyframe of clip.keyframes ?? []) {
          const selected = clip.id === clipId && keyframe.id === keyframeId;
          keyframe.selected = selected;
          if (selected) {
            selectedKeyframe = keyframe;
          }
        }
      }
    }

    this.emit('keyframe:select', {
      clipId,
      keyframeId,
      keyframe: selectedKeyframe ? cloneTimelineKeyframe(selectedKeyframe) : null,
    } satisfies ClipKeyframeSelectEvent);
    this.emit('render');
  }

  /**
   * Clears keyframe selection.
   */
  clearKeyframeSelection() {
    this.selectClipKeyframe(null, null);
  }

  /**
   * Returns viewport rectangles for keyframes in track order.
   */
  getKeyframeRects<TrackKind = string>(
    options: TimelineKeyframeGeometryOptions = {}
  ): TimelineKeyframeRect<TrackKind>[] {
    const keyframeRects: TimelineKeyframeRect<TrackKind>[] = [];

    this.forEachTimelineClipGeometry<TrackKind>(
      options,
      (track, clip, trackIndex, clipIndex, clipRect) => {
        if (options.selectedClipOnly && !clip.selected) {
          return;
        }
        const keyframes = (clip.keyframes ?? []).filter(
          (keyframe) =>
            (options.property === undefined || keyframe.property === options.property) &&
            compareRational(keyframe.time, clip.timelineStart) >= 0 &&
            compareRational(keyframe.time, clip.timelineEnd) <= 0
        );
        for (let keyframeIndex = 0; keyframeIndex < keyframes.length; keyframeIndex++) {
          const keyframe = keyframes[keyframeIndex];
          keyframeRects.push(
            this.createTimelineKeyframeRect(
              track,
              clip,
              trackIndex,
              clipIndex,
              keyframe,
              keyframeIndex,
              clipRect,
              options
            )
          );
        }
      }
    );

    return keyframeRects;
  }

  /**
   * Returns keyframes intersecting the current viewport, plus optional overscan.
   */
  getVisibleKeyframes<TrackKind = string>(
    options: TimelineKeyframeGeometryOptions = {}
  ): VisibleTimelineKeyframe<TrackKind>[] {
    const viewportWidth = Math.max(
      0,
      options.viewportWidth ?? this.state.viewportWidth ?? defaultTimelineViewportWidth
    );
    const viewportHeight =
      options.viewportHeight === undefined ? undefined : Math.max(0, options.viewportHeight);
    const overscanPixels = Math.max(0, options.overscanPixels ?? 0);
    const minX = -overscanPixels;
    const maxX = viewportWidth + overscanPixels;
    const minY = -overscanPixels;
    const maxY = viewportHeight === undefined ? undefined : viewportHeight + overscanPixels;

    return this.getKeyframeRects<TrackKind>(options).filter(({ rect }) => {
      const rectRight = rect.x + rect.width;
      const rectBottom = rect.y + rect.height;
      if (rectRight < minX || rect.x > maxX) {
        return false;
      }
      return maxY === undefined || (rectBottom >= minY && rect.y <= maxY);
    });
  }

  /**
   * Hit-tests timeline keyframes in viewport coordinates.
   */
  getKeyframeAtPoint<TrackKind = string>(
    input: TimelineKeyframeHitTestInput
  ): TimelineKeyframeHitTestResult<TrackKind> | null {
    const hitPadding = input.pointerType === 'touch' ? 8 : 2;
    const rects = this.getVisibleKeyframes<TrackKind>(input);
    for (let index = rects.length - 1; index >= 0; index--) {
      const rect = rects[index].rect;
      if (
        input.x >= rect.x - hitPadding &&
        input.x <= rect.x + rect.width + hitPadding &&
        input.y >= rect.y - hitPadding &&
        input.y <= rect.y + rect.height + hitPadding
      ) {
        return rects[index];
      }
    }

    return null;
  }

  /**
   * Returns keyframe segments in track order.
   */
  getKeyframeSegments<TrackKind = string>(
    options: TimelineKeyframeSegmentGeometryOptions = {}
  ): TimelineKeyframeSegment<TrackKind>[] {
    const segments: TimelineKeyframeSegment<TrackKind>[] = [];

    this.forEachTimelineClipGeometry<TrackKind>(
      options,
      (track, clip, trackIndex, clipIndex, clipRect) => {
        if (options.selectedClipOnly && !clip.selected) {
          return;
        }

        const keyframes = (clip.keyframes ?? [])
          .filter(
            (keyframe) =>
              (options.property === undefined || keyframe.property === options.property) &&
              compareRational(keyframe.time, clip.timelineStart) >= 0 &&
              compareRational(keyframe.time, clip.timelineEnd) <= 0
          )
          .sort((a, b) => {
            const propertyCompare = a.property.localeCompare(b.property);
            return propertyCompare === 0 ? compareRational(a.time, b.time) : propertyCompare;
          });

        for (let index = 0; index < keyframes.length - 1; index++) {
          const startKeyframe = keyframes[index];
          const endKeyframe = keyframes[index + 1];
          if (startKeyframe.property !== endKeyframe.property) {
            continue;
          }
          if (options.selectedKeyframeOnly && !startKeyframe.selected && !endKeyframe.selected) {
            continue;
          }

          segments.push(
            this.createTimelineKeyframeSegment(
              track,
              clip,
              trackIndex,
              clipIndex,
              startKeyframe,
              endKeyframe,
              index,
              index + 1,
              clipRect,
              options
            )
          );
        }
      }
    );

    return segments;
  }

  /**
   * Returns keyframe segments intersecting the current viewport.
   */
  getVisibleKeyframeSegments<TrackKind = string>(
    options: TimelineKeyframeSegmentGeometryOptions = {}
  ): VisibleTimelineKeyframeSegment<TrackKind>[] {
    const viewportWidth = Math.max(
      0,
      options.viewportWidth ?? this.state.viewportWidth ?? defaultTimelineViewportWidth
    );
    const viewportHeight =
      options.viewportHeight === undefined ? undefined : Math.max(0, options.viewportHeight);
    const overscanPixels = Math.max(0, options.overscanPixels ?? 0);
    const minX = -overscanPixels;
    const maxX = viewportWidth + overscanPixels;
    const minY = -overscanPixels;
    const maxY = viewportHeight === undefined ? undefined : viewportHeight + overscanPixels;

    return this.getKeyframeSegments<TrackKind>(options).filter((segment) => {
      const bounds = this.getTimelineKeyframeSegmentBounds(segment);
      if (bounds.right < minX || bounds.left > maxX) {
        return false;
      }
      return maxY === undefined || (bounds.bottom >= minY && bounds.top <= maxY);
    });
  }

  /**
   * Returns serializable keyframe geometry for canvas rendering.
   */
  getKeyframeRenderGeometry(
    options: TimelineKeyframeRenderGeometryOptions
  ): TimelineKeyframeRenderGeometry {
    if (!this.keyframeProperties.has(options.property)) {
      throw new RangeError(`Unregistered keyframe property "${options.property}".`);
    }

    const clips = new Map<string, TimelineKeyframeRenderClip>();
    const getRenderClip = (clipId: string, trackId: string) => {
      const existing = clips.get(clipId);
      if (existing !== undefined) {
        return existing;
      }

      const next: TimelineKeyframeRenderClip = {
        clipId,
        trackId,
        points: [],
        segments: [],
      };
      clips.set(clipId, next);
      return next;
    };

    for (const keyframeRect of this.getVisibleKeyframes(options)) {
      const renderClip = getRenderClip(keyframeRect.clip.id, keyframeRect.track.id);
      const point: TimelineKeyframeRenderPoint = {
        clipId: keyframeRect.clip.id,
        trackId: keyframeRect.track.id,
        keyframeId: keyframeRect.keyframe.id,
        point: {
          x: keyframeRect.rect.x + keyframeRect.rect.width / 2,
          y: keyframeRect.rect.y + keyframeRect.rect.height / 2,
        },
        rect: keyframeRect.rect,
        selected: keyframeRect.keyframe.selected === true,
      };
      renderClip.points.push(point);
    }

    for (const segment of this.getVisibleKeyframeSegments(options)) {
      const renderClip = getRenderClip(segment.clip.id, segment.track.id);
      const renderSegment: TimelineKeyframeRenderSegment = {
        clipId: segment.clip.id,
        trackId: segment.track.id,
        segmentId: segment.segmentId,
        property: segment.property,
        interpolation: segment.interpolation,
        startPoint: segment.startPoint,
        endPoint: segment.endPoint,
      };
      if (segment.controlPoint1 !== undefined) {
        renderSegment.controlPoint1 = segment.controlPoint1;
      }
      if (segment.controlPoint2 !== undefined) {
        renderSegment.controlPoint2 = segment.controlPoint2;
      }
      renderClip.segments.push(renderSegment);
    }

    return {
      property: options.property,
      clips: Array.from(clips.values()).filter(
        (clip) => clip.points.length > 0 || clip.segments.length > 0
      ),
    };
  }

  /**
   * Hit-tests Bezier tangent handles in viewport coordinates.
   */
  getKeyframeTangentHandleAtPoint<TrackKind = string>(
    input: TimelineKeyframeTangentHitTestInput
  ): TimelineKeyframeTangentHandleHitTestResult<TrackKind> | null {
    const hitPadding = input.pointerType === 'touch' ? 8 : 3;
    const segments = this.getVisibleKeyframeSegments<TrackKind>(input);
    for (let segmentIndex = segments.length - 1; segmentIndex >= 0; segmentIndex--) {
      const handles = segments[segmentIndex].handles;
      for (let handleIndex = handles.length - 1; handleIndex >= 0; handleIndex--) {
        const handle = handles[handleIndex];
        const rect = handle.rect;
        if (
          input.x >= rect.x - hitPadding &&
          input.x <= rect.x + rect.width + hitPadding &&
          input.y >= rect.y - hitPadding &&
          input.y <= rect.y + rect.height + hitPadding
        ) {
          return handle;
        }
      }
    }

    return null;
  }

  private createTimelineKeyframeRect<TrackKind>(
    track: Track<TrackKind>,
    clip: Clip,
    trackIndex: number,
    clipIndex: number,
    keyframe: TimelineKeyframe,
    keyframeIndex: number,
    clipRect: ClipViewportRect,
    options: TimelineKeyframeGeometryOptions
  ): TimelineKeyframeRect<TrackKind> {
    const size = Math.max(4, options.keyframeSize ?? 8);
    const valuePadding = Math.max(0, options.keyframeValuePadding ?? 7);
    const point = this.createTimelineKeyframePoint(keyframe, clipRect, size, valuePadding);
    const maxX = Math.max(clipRect.x, clipRect.x + clipRect.width - size);
    const maxY = Math.max(clipRect.y, clipRect.y + clipRect.height - size);

    return {
      clip,
      track,
      trackIndex,
      clipIndex,
      keyframe,
      keyframeIndex,
      rect: {
        clipId: clip.id,
        trackId: track.id,
        keyframeId: keyframe.id,
        x: clampViewportCoordinate(point.x - size / 2, clipRect.x, maxX),
        y: clampViewportCoordinate(point.y - size / 2, clipRect.y, maxY),
        width: size,
        height: size,
      },
      canEdit: !track.locked,
    };
  }

  private createTimelineKeyframePoint(
    keyframe: TimelineKeyframe,
    clipRect: ClipViewportRect,
    handleSize: number,
    valuePadding: number
  ): TimelineKeyframePoint {
    return getTimelineKeyframeValuePoint({
      timeX: this.timeToPixel(keyframe.time),
      value: this.normalizeKeyframeValue(keyframe.property, keyframe.value) ?? 0,
      clipX: clipRect.x,
      clipWidth: clipRect.width,
      clipY: clipRect.y,
      clipHeight: clipRect.height,
      valuePadding,
      handleSize,
    });
  }

  private createTimelineKeyframeSegment<TrackKind>(
    track: Track<TrackKind>,
    clip: Clip,
    trackIndex: number,
    clipIndex: number,
    startKeyframe: TimelineKeyframe,
    endKeyframe: TimelineKeyframe,
    startKeyframeIndex: number,
    endKeyframeIndex: number,
    clipRect: ClipViewportRect,
    options: TimelineKeyframeSegmentGeometryOptions
  ): TimelineKeyframeSegment<TrackKind> {
    const keyframeSize = Math.max(4, options.keyframeSize ?? 8);
    const tangentHandleSize = Math.max(4, options.tangentHandleSize ?? 7);
    const valuePadding = Math.max(0, options.keyframeValuePadding ?? 7);
    const startPoint = this.createTimelineKeyframePoint(
      startKeyframe,
      clipRect,
      keyframeSize,
      valuePadding
    );
    const endPoint = this.createTimelineKeyframePoint(
      endKeyframe,
      clipRect,
      keyframeSize,
      valuePadding
    );
    const outgoing = normalizeTimelineKeyframeSideInterpolation(
      startKeyframe.outgoing,
      defaultTimelineOutgoingBezierHandle
    );
    const incoming = normalizeTimelineKeyframeSideInterpolation(
      endKeyframe.incoming,
      defaultTimelineIncomingBezierHandle
    );
    const interpolation =
      outgoing.interpolation === 'hold'
        ? 'hold'
        : outgoing.interpolation === 'bezier' || incoming.interpolation === 'bezier'
          ? 'bezier'
          : 'linear';
    const segmentId = `${clip.id}:${startKeyframe.id}:${endKeyframe.id}:${startKeyframe.property}`;
    const canEdit = !track.locked;
    const base: Omit<
      TimelineKeyframeSegment<TrackKind>,
      'controlPoint1' | 'controlPoint2' | 'handles'
    > = {
      clip,
      track,
      trackIndex,
      clipIndex,
      segmentId,
      property: startKeyframe.property,
      startKeyframe,
      endKeyframe,
      startKeyframeIndex,
      endKeyframeIndex,
      interpolation,
      outgoing,
      incoming,
      startPoint,
      endPoint,
      canEdit,
    };

    if (interpolation !== 'bezier') {
      return {
        ...base,
        handles: [],
      };
    }

    const { controlPoint1, controlPoint2 } = getTimelineKeyframeBezierControlPoints(
      startPoint,
      endPoint,
      outgoing.handle,
      incoming.handle
    );
    const outgoingHandle = normalizeTimelineKeyframeBezierHandle(
      outgoing.handle,
      defaultTimelineOutgoingBezierHandle
    );
    const incomingHandle = normalizeTimelineKeyframeBezierHandle(
      incoming.handle,
      defaultTimelineIncomingBezierHandle
    );
    const handles: TimelineKeyframeTangentHandle<TrackKind>[] = [
      this.createTimelineKeyframeTangentHandle({
        track,
        clip,
        trackIndex,
        clipIndex,
        segmentId,
        keyframe: startKeyframe,
        keyframeIndex: startKeyframeIndex,
        anchorKeyframe: startKeyframe,
        anchorKeyframeIndex: startKeyframeIndex,
        pairedKeyframe: endKeyframe,
        side: 'outgoing',
        point: controlPoint1,
        anchorPoint: startPoint,
        tangent: outgoingHandle,
        size: tangentHandleSize,
        canEdit,
      }),
      this.createTimelineKeyframeTangentHandle({
        track,
        clip,
        trackIndex,
        clipIndex,
        segmentId,
        keyframe: endKeyframe,
        keyframeIndex: endKeyframeIndex,
        anchorKeyframe: endKeyframe,
        anchorKeyframeIndex: endKeyframeIndex,
        pairedKeyframe: startKeyframe,
        side: 'incoming',
        point: controlPoint2,
        anchorPoint: endPoint,
        tangent: incomingHandle,
        size: tangentHandleSize,
        canEdit,
      }),
    ];

    return {
      ...base,
      controlPoint1,
      controlPoint2,
      handles,
    };
  }

  private createTimelineKeyframeTangentHandle<TrackKind>(input: {
    track: Track<TrackKind>;
    clip: Clip;
    trackIndex: number;
    clipIndex: number;
    segmentId: string;
    keyframe: TimelineKeyframe;
    keyframeIndex: number;
    anchorKeyframe: TimelineKeyframe;
    anchorKeyframeIndex: number;
    pairedKeyframe: TimelineKeyframe;
    side: TimelineKeyframeSide;
    point: TimelineKeyframePoint;
    anchorPoint: TimelineKeyframePoint;
    tangent: NonNullable<TimelineKeyframeTangentHandle['tangent']>;
    size: number;
    canEdit: boolean;
  }): TimelineKeyframeTangentHandle<TrackKind> {
    return {
      track: input.track,
      clip: input.clip,
      trackIndex: input.trackIndex,
      clipIndex: input.clipIndex,
      segmentId: input.segmentId,
      side: input.side,
      keyframe: input.keyframe,
      keyframeIndex: input.keyframeIndex,
      anchorKeyframe: input.anchorKeyframe,
      anchorKeyframeIndex: input.anchorKeyframeIndex,
      pairedKeyframe: input.pairedKeyframe,
      tangent: input.tangent,
      anchorPoint: input.anchorPoint,
      point: input.point,
      rect: {
        clipId: input.clip.id,
        trackId: input.track.id,
        segmentId: input.segmentId,
        keyframeId: input.keyframe.id,
        anchorKeyframeId: input.anchorKeyframe.id,
        side: input.side,
        x: clampViewportCoordinate(input.point.x - input.size / 2, -Infinity, Infinity),
        y: clampViewportCoordinate(input.point.y - input.size / 2, -Infinity, Infinity),
        width: input.size,
        height: input.size,
      },
      canEdit: input.canEdit,
    };
  }

  private getTimelineKeyframeSegmentBounds<TrackKind>(
    segment: TimelineKeyframeSegment<TrackKind>
  ): {
    left: number;
    right: number;
    top: number;
    bottom: number;
  } {
    const points = [
      segment.startPoint,
      segment.endPoint,
      segment.controlPoint1,
      segment.controlPoint2,
      ...segment.handles.map((handle) => handle.point),
    ].filter((point): point is TimelineKeyframePoint => point !== undefined);

    return points.reduce(
      (bounds, point) => ({
        left: Math.min(bounds.left, point.x),
        right: Math.max(bounds.right, point.x),
        top: Math.min(bounds.top, point.y),
        bottom: Math.max(bounds.bottom, point.y),
      }),
      {
        left: Number.POSITIVE_INFINITY,
        right: Number.NEGATIVE_INFINITY,
        top: Number.POSITIVE_INFINITY,
        bottom: Number.NEGATIVE_INFINITY,
      }
    );
  }

  private clampKeyframeTimeToClip(clip: Clip, time: RationalTime): RationalTime {
    return minRational(maxRational(time, clip.timelineStart), clip.timelineEnd);
  }

  private getRequiredKeyframePropertyDefinition(
    property: TimelineKeyframePropertyId
  ): TimelineRegisteredKeyframePropertyDefinition | null {
    return this.keyframeProperties.get(property);
  }

  private clampKeyframeValue(property: TimelineKeyframePropertyId, value: number): number | null {
    return this.keyframeProperties.clampValue(property, value);
  }

  private normalizeKeyframeValue(
    property: TimelineKeyframePropertyId,
    value: number
  ): number | null {
    return this.keyframeProperties.normalizeValue(property, value);
  }

  private normalizeClipKeyframes(clip: Clip) {
    this.keyframeProperties.normalizeClipKeyframes(clip);
  }

  protected validateRegisteredClipKeyframes() {
    for (const track of this.state.tracks) {
      for (const clip of track.clips) {
        this.normalizeClipKeyframes(clip);
      }
    }
  }

  private commitKeyframeMutation(options: TimelineKeyframeMutationOptions) {
    this.emit('render');
    if (options.commit === false) {
      this.emit('state:preview');
      return;
    }

    this.snapshot();
    this.emit('state:settled');
  }
}
