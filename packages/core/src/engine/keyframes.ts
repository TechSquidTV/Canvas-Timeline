import { evaluateKeyframeCurve, resolveKeyframeCurve } from '#core/engine/keyframe-curves';
import { timelineCommandFail, timelineCommandOk } from '#core/command-result';
import type { TimelineCommandResult } from '#core/command-result';
import { findClipInTracks } from '#core/engine/clip-lookup';
import type { TypedEventEmitter } from '#core/emitter';
import { clampViewportCoordinate, defaultTimelineViewportWidth } from '#core/engine/geometry';
import type { TimelineGeometry } from '#core/engine/interaction-geometry';
import type { KeyframePropertyRegistry } from '#core/engine/keyframe-property-registry';
import type { EngineEventMap } from '#core/events';
import {
  defaultTimelineIncomingBezierHandle,
  defaultTimelineOutgoingBezierHandle,
  getTimelineKeyframeBezierControlPoints,
  getTimelineKeyframeValuePoint,
  normalizeTimelineKeyframeBezierHandle,
} from '#core/keyframes';
import { cloneTimelineKeyframe, sortTimelineKeyframes } from '#core/snapshot';
import type {
  Clip,
  ClipViewportRect,
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
  TimelineKeyframeTangentHandle,
  TimelineKeyframeTangentHandleHitTestResult,
  TimelineKeyframeTangentHitTestInput,
  TimelineRegisteredKeyframePropertyDefinition,
  TimelineSetClipKeyframeOptions,
  TimelineState,
  TimelineStateSnapshot,
  TimelineKeyframeEdit,
  TimelineKeyframeEditCommand,
  TimelineEditCommitResult,
  TimelineEditPreview,
  TimelineKeyframeReference,
  TimelineKeyframeClipboard,
  TimelineReadonly,
  TimelineUpdateClipKeyframeOptions,
  TimelineUpdateClipKeyframeSideOptions,
  TimelineUpdateClipKeyframeSidesOptions,
  Track,
  VisibleTimelineKeyframe,
  VisibleTimelineKeyframeSegment,
} from '#core/types';
import {
  addRational,
  compareRational,
  maxRational,
  minRational,
  subRational,
  toSeconds,
} from '@techsquidtv/canvas-timeline-utils';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
function isSameRationalTime(left: RationalTime, right: RationalTime) {
  return compareRational(left, right) === 0;
}

interface KeyframeContext {
  state: TimelineState;
  geometry: TimelineGeometry;
  keyframeProperties: KeyframePropertyRegistry;
  emit: TypedEventEmitter<EngineEventMap>['emit'];
  timeToPixel: (time: RationalTime) => number;
  getRenderState: () => TimelineStateSnapshot;
  commitEdit: (command: TimelineKeyframeEditCommand) => TimelineEditCommitResult;
  previewEdit: (command: TimelineKeyframeEditCommand) => TimelineEditPreview;
}

/** Registered keyframe queries, editing, and drawing geometry. */
export class TimelineKeyframes {
  constructor(private context: KeyframeContext) {}
  private propertyKeyCache = new WeakMap<
    TimelineReadonly<Clip>,
    Map<string, TimelineReadonly<TimelineKeyframe>[]>
  >();

  private getPropertyKeys(
    clip: TimelineReadonly<Clip>,
    property: string
  ): TimelineReadonly<TimelineKeyframe>[] {
    const cached = this.propertyKeyCache.get(clip)?.get(property);
    if (cached) {
      return cached;
    }
    const keys = (clip.keyframes ?? []).filter(
      (key) =>
        key.property === property &&
        compareRational(key.time, clip.timelineStart) >= 0 &&
        compareRational(key.time, clip.timelineEnd) <= 0
    );
    sortTimelineKeyframes(keys);
    if (Object.isFrozen(clip)) {
      const properties =
        this.propertyKeyCache.get(clip) ?? new Map<string, TimelineReadonly<TimelineKeyframe>[]>();
      properties.set(property, keys);
      this.propertyKeyCache.set(clip, properties);
    }
    return keys;
  }

  private resolveClip(
    clipIdOrClip: string | TimelineReadonly<Clip>
  ): TimelineReadonly<Clip> | undefined {
    return typeof clipIdOrClip === 'string'
      ? findClipInTracks(this.context.getRenderState().tracks, clipIdOrClip)?.clip
      : clipIdOrClip;
  }

  /**
   * Returns keyframes owned by one clip, optionally filtered by property.
   */
  getClipKeyframes(
    clipId: string,
    property?: TimelineKeyframePropertyId
  ): TimelineReadonly<TimelineKeyframe>[] {
    const clip = this.resolveClip(clipId);
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
    clipIdOrClip: string | TimelineReadonly<Clip>,
    property: TimelineKeyframePropertyId,
    timelineTime: RationalTime = this.context.state.playheadTime
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
      ? this.context.keyframeProperties.clampDefinitionValue(
          definition,
          definition.getBaseValue(clip),
          `keyframe property "${property}" base value`
        )
      : definition.defaultValue;
    const keyframes = this.getPropertyKeys(clip, property);

    if (keyframes.length === 0) {
      return fallback;
    }

    const first = keyframes[0];
    const last = keyframes[keyframes.length - 1];
    if (compareRational(timelineTime, first.time) <= 0) {
      return this.context.keyframeProperties.clampDefinitionValue(
        definition,
        first.value,
        'keyframe value'
      );
    }
    if (compareRational(timelineTime, last.time) >= 0) {
      return this.context.keyframeProperties.clampDefinitionValue(
        definition,
        last.value,
        'keyframe value'
      );
    }

    let low = 0;
    let high = keyframes.length - 1;
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      if (compareRational(keyframes[mid].time, timelineTime) <= 0) {
        low = mid;
      } else {
        high = mid;
      }
    }
    const left = keyframes[low];
    const right = keyframes[high];
    const curve = resolveKeyframeCurve(left, right, this.context.keyframeProperties);
    const span = toSeconds(subRational(right.time, left.time));
    const progress = span <= 0 ? 1 : toSeconds(subRational(timelineTime, left.time)) / span;
    return this.context.keyframeProperties.denormalizeDefinitionValue(
      definition,
      evaluateKeyframeCurve(curve, progress),
      'interpolated keyframe value'
    );
  }

  /**
   * Adds or updates one keyframe by clip, property, and exact timeline time.
   *
   * Inserting between keys subdivides the surrounding curve before applying explicit values or sides.
   */
  setClipKeyframe(
    input: TimelineSetClipKeyframeOptions,
    options: TimelineKeyframeMutationOptions = {}
  ): TimelineKeyframe | null {
    const preview = this.applyEdit({ type: 'set', ...input }, options);
    if (!preview) {
      return null;
    }
    const clip = preview.changedClips.find((candidate) => candidate.id === input.clipId);
    const time = clip ? this.clampKeyframeTimeToClip(clip, input.time) : input.time;
    const key = clip?.keyframes?.find(
      (candidate) =>
        candidate.property === input.property && isSameRationalTime(candidate.time, time)
    );
    return key ? cloneTimelineKeyframe(key) : null;
  }

  /** Updates an existing key; a collision rejects the complete edit. */
  updateClipKeyframe(
    input: TimelineUpdateClipKeyframeOptions,
    options: TimelineKeyframeMutationOptions = {}
  ): TimelineKeyframe | null {
    return this.updatedKeyframe(input, this.applyEdit({ type: 'update', ...input }, options));
  }

  /** Updates one side, respecting the key's tangent coupling mode. */
  updateClipKeyframeSide(
    input: TimelineUpdateClipKeyframeSideOptions,
    options: TimelineKeyframeMutationOptions = {}
  ): TimelineKeyframe | null {
    return this.updateClipKeyframeSides(
      { clipId: input.clipId, keyframeId: input.keyframeId, [input.side]: input.patch },
      options
    );
  }

  /** Updates both sides atomically. */
  updateClipKeyframeSides(
    input: TimelineUpdateClipKeyframeSidesOptions,
    options: TimelineKeyframeMutationOptions = {}
  ): TimelineKeyframe | null {
    return this.updatedKeyframe(input, this.applyEdit({ type: 'sides', ...input }, options));
  }

  /** Removes one keyframe. */
  removeClipKeyframe(
    clipId: string,
    keyframeId: string,
    options: TimelineKeyframeMutationOptions = {}
  ): boolean {
    return this.applyEdit({ type: 'remove', clipId, keyframeId }, options) !== null;
  }

  private updatedKeyframe(input: TimelineKeyframeReference, preview: TimelineEditPreview | null) {
    const key = preview?.changedClips
      .find((clip) => clip.id === input.clipId)
      ?.keyframes?.find((candidate) => candidate.id === input.keyframeId);
    return key ? cloneTimelineKeyframe(key) : null;
  }

  private applyEdit(
    edit: TimelineKeyframeEdit,
    options: TimelineKeyframeMutationOptions
  ): TimelineEditPreview | null {
    const command: TimelineKeyframeEditCommand = { type: 'keyframes', edits: [edit] };
    const result =
      options.commit === false
        ? this.context.previewEdit(command)
        : this.context.commitEdit(command).preview;
    if (!result.valid) {
      if (
        result.reason === 'invalid-range' &&
        result.message !== 'A keyframe already exists at that time.'
      ) {
        throw new RangeError(result.message);
      }
      return null;
    }
    return result;
  }

  /** Selects keys using replacement, additive or toggle semantics. */
  selectKeyframes(
    references: readonly TimelineKeyframeReference[],
    mode: 'replace' | 'add' | 'toggle' = 'replace'
  ): TimelineCommandResult {
    if (
      references.some(
        (ref) =>
          !findClipInTracks(this.context.state.tracks, ref.clipId)?.clip.keyframes?.some(
            (key) => key.id === ref.keyframeId
          )
      )
    ) {
      return timelineCommandFail('not-found');
    }
    const identities = new Set(
      references.map((ref) => JSON.stringify([ref.clipId, ref.keyframeId]))
    );
    for (const track of this.context.state.tracks) {
      for (const clip of track.clips) {
        for (const key of clip.keyframes ?? []) {
          const match = identities.has(JSON.stringify([clip.id, key.id]));
          key.selected =
            mode === 'replace'
              ? match
              : mode === 'toggle' && match
                ? !key.selected
                : key.selected || match;
        }
      }
    }
    this.context.emit('keyframe:select', { keyframes: this.getSelectedKeyframes() });
    this.context.emit('render');
    return timelineCommandOk();
  }

  /** Current keyframe selection in clip/property/time order. */
  getSelectedKeyframes(): TimelineKeyframeReference[] {
    return this.context.state.tracks.flatMap((track) =>
      track.clips.flatMap((clip) =>
        (clip.keyframes ?? [])
          .filter((key) => key.selected)
          .map((key) => ({ clipId: clip.id, keyframeId: key.id }))
      )
    );
  }

  /** Clears the current keyframe selection. */
  clearKeyframeSelection() {
    return this.selectKeyframes([]);
  }

  /** Copies keys independently of the clip clipboard, preserving their relative timing. */
  copyKeyframes(
    references: readonly TimelineKeyframeReference[] = this.getSelectedKeyframes()
  ): TimelineKeyframeClipboard {
    const entries = references.flatMap((ref) => {
      const key = this.getClipKeyframes(ref.clipId).find(
        (candidate) => candidate.id === ref.keyframeId
      );
      return key ? [{ clipId: ref.clipId, keyframe: cloneTimelineKeyframe(key) }] : [];
    });
    const start = entries.reduce<RationalTime | undefined>(
      (minimum, entry) =>
        minimum === undefined ? entry.keyframe.time : minRational(minimum, entry.keyframe.time),
      undefined
    );
    if (start) {
      for (const entry of entries) {
        entry.keyframe.time = subRational(entry.keyframe.time, start);
      }
    }
    return { entries };
  }

  /** Builds an atomic paste command at a new time, optionally into one clip. */
  createPasteCommand(
    clipboard: TimelineKeyframeClipboard,
    time: RationalTime,
    clipId?: string
  ): TimelineKeyframeEditCommand {
    const entries = clipboard.entries.map((entry) => ({
      keyframe: cloneTimelineKeyframe(entry.keyframe),
      id: crypto.randomUUID(),
      clipId: clipId ?? entry.clipId,
    }));
    return {
      type: 'keyframes',
      // Insert every anchor before restoring sides: later subdivision must not rewrite copied handles.
      edits: [
        ...entries.map((entry): TimelineKeyframeEdit => ({
          type: 'set',
          id: entry.id,
          clipId: entry.clipId,
          property: entry.keyframe.property,
          value: entry.keyframe.value,
          selected: true,
          time: addRational(time, entry.keyframe.time),
        })),
        ...entries.map((entry): TimelineKeyframeEdit => ({
          type: 'update',
          keyframeId: entry.id,
          clipId: entry.clipId,
          incoming: entry.keyframe.incoming ?? { interpolation: 'linear' },
          outgoing: entry.keyframe.outgoing ?? { interpolation: 'linear' },
          tangentMode: entry.keyframe.tangentMode,
        })),
      ],
    };
  }

  /**
   * Returns viewport rectangles for keyframes in track order.
   */
  getKeyframeRects(options: TimelineKeyframeGeometryOptions = {}): TimelineKeyframeRect<string>[] {
    const keyframeRects: TimelineKeyframeRect<string>[] = [];

    this.context.geometry.forEachTimelineClipGeometry(
      options,
      (track, clip, trackIndex, clipIndex, clipRect) => {
        if (options.clipId !== undefined && options.clipId !== clip.id) {
          return;
        }
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
  getVisibleKeyframes(
    options: TimelineKeyframeGeometryOptions = {},
    rects: readonly TimelineKeyframeRect<string>[] = this.getKeyframeRects(options)
  ): VisibleTimelineKeyframe<string>[] {
    const viewportWidth = Math.max(
      0,
      options.viewportWidth ?? this.context.state.viewportWidth ?? defaultTimelineViewportWidth
    );
    const viewportHeight =
      options.viewportHeight === undefined ? undefined : Math.max(0, options.viewportHeight);
    const overscanPixels = Math.max(0, options.overscanPixels ?? 0);
    const minX = -overscanPixels;
    const maxX = viewportWidth + overscanPixels;
    const minY = -overscanPixels;
    const maxY = viewportHeight === undefined ? undefined : viewportHeight + overscanPixels;

    return rects.filter(({ rect }) => {
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
  getKeyframeAtPoint(
    input: TimelineKeyframeHitTestInput
  ): TimelineKeyframeHitTestResult<string> | null {
    const hitPadding = input.pointerType === 'touch' ? 8 : 2;
    const rects = this.getVisibleKeyframes(input);
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
  getKeyframeSegments(
    options: TimelineKeyframeSegmentGeometryOptions = {}
  ): TimelineKeyframeSegment<string>[] {
    const segments: TimelineKeyframeSegment<string>[] = [];

    this.context.geometry.forEachTimelineClipGeometry(
      options,
      (track, clip, trackIndex, clipIndex, clipRect) => {
        if (options.clipId !== undefined && options.clipId !== clip.id) {
          return;
        }
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
  getVisibleKeyframeSegments(
    options: TimelineKeyframeSegmentGeometryOptions = {},
    segments: readonly TimelineKeyframeSegment<string>[] = this.getKeyframeSegments(options)
  ): VisibleTimelineKeyframeSegment<string>[] {
    const viewportWidth = Math.max(
      0,
      options.viewportWidth ?? this.context.state.viewportWidth ?? defaultTimelineViewportWidth
    );
    const viewportHeight =
      options.viewportHeight === undefined ? undefined : Math.max(0, options.viewportHeight);
    const overscanPixels = Math.max(0, options.overscanPixels ?? 0);
    const minX = -overscanPixels;
    const maxX = viewportWidth + overscanPixels;
    const minY = -overscanPixels;
    const maxY = viewportHeight === undefined ? undefined : viewportHeight + overscanPixels;

    return segments.filter((segment) => {
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
    if (!this.context.keyframeProperties.has(options.property)) {
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
        tangentHandles: segment.handles
          .filter((handle) => handle.anchorKeyframe.selected)
          .map((handle) => ({ point: handle.point, anchorPoint: handle.anchorPoint })),
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
  getKeyframeTangentHandleAtPoint(
    input: TimelineKeyframeTangentHitTestInput
  ): TimelineKeyframeTangentHandleHitTestResult<string> | null {
    const hitPadding = input.pointerType === 'touch' ? 8 : 3;
    const segments = this.getVisibleKeyframeSegments(input);
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

  private createTimelineKeyframeRect(
    track: TimelineReadonly<Track>,
    clip: TimelineReadonly<Clip>,
    trackIndex: number,
    clipIndex: number,
    keyframe: TimelineKeyframe,
    keyframeIndex: number,
    clipRect: ClipViewportRect,
    options: TimelineKeyframeGeometryOptions
  ): TimelineKeyframeRect<string> {
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
      timeX: this.context.timeToPixel(keyframe.time),
      value: this.normalizeKeyframeValue(keyframe.property, keyframe.value) ?? 0,
      clipX: clipRect.x,
      clipWidth: clipRect.width,
      clipY: clipRect.y,
      clipHeight: clipRect.height,
      valuePadding,
      handleSize,
    });
  }

  private createTimelineKeyframeSegment(
    track: TimelineReadonly<Track>,
    clip: TimelineReadonly<Clip>,
    trackIndex: number,
    clipIndex: number,
    startKeyframe: TimelineKeyframe,
    endKeyframe: TimelineKeyframe,
    startKeyframeIndex: number,
    endKeyframeIndex: number,
    clipRect: ClipViewportRect,
    options: TimelineKeyframeSegmentGeometryOptions
  ): TimelineKeyframeSegment<string> {
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
    const curve = resolveKeyframeCurve(startKeyframe, endKeyframe, this.context.keyframeProperties);
    const outgoing = { interpolation: curve.mode, handle: curve.control1 };
    const incoming = { interpolation: curve.mode, handle: curve.control2 };
    const interpolation = curve.mode;
    const segmentId = `${clip.id}:${startKeyframe.id}:${endKeyframe.id}:${startKeyframe.property}`;
    const canEdit = !track.locked;
    const base: Omit<
      TimelineKeyframeSegment<string>,
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
      incoming.handle,
      { top: clipRect.y + valuePadding, height: Math.max(1, clipRect.height - valuePadding * 2) }
    );
    const outgoingHandle = normalizeTimelineKeyframeBezierHandle(
      outgoing.handle,
      defaultTimelineOutgoingBezierHandle
    );
    const incomingHandle = normalizeTimelineKeyframeBezierHandle(
      incoming.handle,
      defaultTimelineIncomingBezierHandle
    );
    const handles: TimelineKeyframeTangentHandle<string>[] = [
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

  private createTimelineKeyframeTangentHandle(input: {
    track: TimelineReadonly<Track>;
    clip: TimelineReadonly<Clip>;
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
  }): TimelineKeyframeTangentHandle<string> {
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

  private getTimelineKeyframeSegmentBounds(segment: TimelineKeyframeSegment<string>): {
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

  private clampKeyframeTimeToClip(clip: TimelineReadonly<Clip>, time: RationalTime): RationalTime {
    return minRational(maxRational(time, clip.timelineStart), clip.timelineEnd);
  }

  private getRequiredKeyframePropertyDefinition(
    property: TimelineKeyframePropertyId
  ): TimelineRegisteredKeyframePropertyDefinition | null {
    return this.context.keyframeProperties.get(property);
  }

  private clampKeyframeValue(property: TimelineKeyframePropertyId, value: number): number | null {
    return this.context.keyframeProperties.clampValue(property, value);
  }

  private normalizeKeyframeValue(
    property: TimelineKeyframePropertyId,
    value: number
  ): number | null {
    return this.context.keyframeProperties.normalizeValue(property, value);
  }

  private normalizeClipKeyframes(clip: Clip) {
    this.context.keyframeProperties.normalizeClipKeyframes(clip);
  }

  /** @internal Normalizes initial keyframes after registration. */
  validateRegisteredClipKeyframes() {
    for (const track of this.context.state.tracks) {
      for (const clip of track.clips) {
        this.normalizeClipKeyframes(clip);
      }
    }
  }
}
