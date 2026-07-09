import type {
  ActiveClip,
  ActiveClipQuery,
  ActiveLayerSelector,
  ActiveLayerOptions,
  ActiveLayerResult,
  Clip,
  ClipHitRegion,
  ClipHitTestInput,
  ClipHitTestResult,
  ClipSourceRange,
  ClipViewportRect,
  TimelineClipDropFeedback,
  Marker,
  PlaybackOptions,
  TimelineClipMoveOptions,
  TimelineClipMoveResult,
  TimelineClipGeometryOptions,
  TimelineClipGroupPlacement,
  TimelineClipRect,
  TimelineDeleteClipsEditCommand,
  TimelineDeleteRangeEditCommand,
  TimelineEditAffectedRange,
  TimelineEditCommand,
  TimelineEditCommitResult,
  TimelineSnapFeedback,
  TimelineSnapResult,
  TimelineSnapTarget,
  TimelineTrackHeightBatchOptions,
  TimelineTrackGeometryOptions,
  TimelineTrackHeightUpdate,
  TimelineTrackHitTestResult,
  TimelineTrackRect,
  TimelineEditImpact,
  TimelineEditImpacts,
  TimelineEditPolicy,
  TimelineEditPolicyContext,
  TimelineEditPreview,
  TimelineEditRejectionReason,
  TimelineEditValidationResult,
  TimelineInsertEditCommand,
  TimelineInsertClipGroupEditCommand,
  TimelineInteractionGeometry,
  TimelineClipGroup,
  TimelineCreateClipGroupOptions,
  TimelineInsertClipGroupOptions,
  TimelineKeyframe,
  TimelineKeyframePoint,
  TimelineKeyframeGeometryOptions,
  TimelineKeyframeHitTestInput,
  TimelineKeyframeHitTestResult,
  TimelineKeyframeMutationOptions,
  TimelineKeyframePropertyDefinition,
  TimelineKeyframePropertyId,
  TimelineKeyframeRect,
  TimelineKeyframeRenderClip,
  TimelineKeyframeRenderGeometry,
  TimelineKeyframeRenderGeometryOptions,
  TimelineKeyframeRenderPoint,
  TimelineKeyframeRenderSegment,
  TimelineKeyframeSidePatch,
  TimelineKeyframeSegment,
  TimelineKeyframeSegmentGeometryOptions,
  TimelineKeyframeSide,
  TimelineKeyframeTangentHandle,
  TimelineKeyframeTangentHandleHitTestResult,
  TimelineKeyframeTangentHitTestInput,
  TimelineLiftRangeEditCommand,
  TimelineMoveEditCommand,
  TimelineOverwriteEditCommand,
  TimelineOverwriteClipGroupEditCommand,
  TimelinePlaceClipCommand,
  TimelineRegisteredKeyframePropertyDefinition,
  TimelineRippleTrimEditCommand,
  TimelineRollTrimEditCommand,
  TimelineSlideEditCommand,
  TimelineSplitEditCommand,
  TimelineSlipEditCommand,
  TimelineState,
  TimelineSetClipKeyframeOptions,
  TimelineTrimEditCommand,
  TimelineUpdateClipKeyframeOptions,
  TimelineUpdateClipKeyframeSideOptions,
  TimelineUpdateClipKeyframeSidesOptions,
  TrackHitTestInput,
  Track,
  VisibleTimelineKeyframeSegment,
  VisibleTimelineKeyframe,
  VisibleTimelineClip,
  VisibleTimelineClipOptions,
} from '#core/types';
import { TypedEventEmitter } from '#core/emitter';
import type {
  EngineEventMap,
  ClipCreatedEvent,
  ClipMoveEvent,
  ClipRemovedEvent,
  ClipSplitEvent,
  ClipKeyframeChangeEvent,
  ClipKeyframeRemoveEvent,
  ClipKeyframeSelectEvent,
} from '#core/events';
import { SnapIndex } from '#core/snapping';
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
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import {
  assertValidRationalTime,
  toSeconds,
  fromSeconds,
  addRational,
  subRational,
  compareRational,
  maxRational,
  minRational,
  resolveTimecodeFrameRate,
} from '@techsquidtv/canvas-timeline-utils';

import { PlaybackManager } from '#core/playback';
import { HistoryManager } from '#core/history';
import { ClipboardManager } from '#core/clipboard';
import {
  assertNonNegativeTimelineNumber,
  assertPositiveTimelineNumber,
  assertValidClipTiming,
  assertValidTimelineNumber,
  cloneRationalTime,
  cloneTimelineKeyframe,
  createClipSnapshot,
  createClipGroupSnapshots,
  createMarkerSnapshots,
  createTrackSnapshot,
  createTrackSnapshots,
  sortTimelineKeyframes,
  stringifyTrackSnapshots,
} from '#core/snapshot';
import {
  defaultTimelineEditValidationResult,
  emptyTimelineClipDropFeedback,
  emptyTimelineSnapFeedback,
  createClipDropFeedbackSnapshot,
  createTimelineEditImpactsSnapshot,
  hasClipDropFeedback,
  isSameClipDropFeedback,
} from '#core/engine/feedback';
import {
  clampViewportCoordinate,
  defaultTimelineMaxPixelsPerFrame,
  defaultTimelineViewportHeight,
  defaultTimelineViewportWidth,
  normalizeViewportCoordinate,
  resolveTimelineInteractionGeometry,
  type ResolvedTimelineInteractionGeometry,
  type TimelineZoomConstraints,
} from '#core/engine/geometry';
import { filterClipKeyframesToClipRange, shiftClipKeyframes } from '#core/engine/clip-keyframes';
import type {
  TimelineCreatedClipEvent,
  TimelineRejectedClipGroupPlacements,
  TimelineRemovedClipEvent,
  TimelineResolvedClipGroupPlacement,
  TimelineResolvedClipGroupPlacements,
  TimelineResolvedEdit,
} from '#core/engine/types';
import type {
  SnapPreparationOptions,
  TimelineSnapProvider,
  TimelineSnapProviderContext,
} from '#core/engine/snapping';
import { createEditCommandFingerprint } from '#core/engine/edit-fingerprint';
import {
  createClipSourceRange,
  createClipSyncKey,
  mapSourceTimeToTimelineTime,
  mapTimelineTimeToSourceTime,
} from '#core/engine/media-sync';
import { KeyframePropertyRegistry } from '#core/engine/keyframe-property-registry';

export {
  defaultTimelineInteractionGeometry,
  defaultTimelineMaxPixelsPerFrame,
} from '#core/engine/geometry';
export type { TimelineZoomConstraints } from '#core/engine/geometry';
export { shiftClipKeyframes } from '#core/engine/clip-keyframes';
export type {
  SnapPreparationOptions,
  TimelineSnapInteractionOperation,
  TimelineSnapProvider,
  TimelineSnapProviderContext,
} from '#core/engine/snapping';

const minimumTimelineEditDurationSeconds = 0.01;

function isSameRationalTime(left: RationalTime, right: RationalTime) {
  return compareRational(left, right) === 0;
}

/**
 * TimelineEngine
 *
 * The central orchestrator and coordinator for the high-performance timeline editor.
 * Maintains state (tracks, clips, markers, playhead position, zoom scale, scrolls, snaps),
 * builds dynamic snap indexes for magnetic snap guidance, handles split and edit actions,
 * and publishes state events to trigger low-latency canvas renderings and lightweight React layouts.
 */
export class TimelineEngine extends TypedEventEmitter<EngineEventMap> {
  private state: TimelineState;
  private zoomConstraints: TimelineZoomConstraints = {};
  private editPolicy: TimelineEditPolicy | undefined;
  private activeClips = new Set<string>();
  private snapIndex = new SnapIndex();
  private snapProviders = new Set<TimelineSnapProvider>();
  private keyframeProperties = new KeyframePropertyRegistry();

  private playbackManager: PlaybackManager;
  private historyManager: HistoryManager;
  private clipboardManager: ClipboardManager;

  // Live Drag Preview State
  private dragSnapshot: string | null = null;
  private editImpacts: TimelineEditImpacts | null = null;
  private editPreview: TimelineEditPreview | null = null;
  private editResolution: TimelineResolvedEdit | null = null;
  private pendingClipMoveCommitEvent: ClipMoveEvent | null = null;

  private getTracks<TrackKind = string>(): Track<TrackKind>[] {
    return this.state.tracks as Track<TrackKind>[];
  }

  /**
   * Creates an instance of the TimelineEngine.
   *
   * @param initialState - Object containing initial tracks and optional configurations.
   * @param initialState.tracks - The track lanes and their visual clips.
   * @param initialState.markers - Optional list of initial navigation pins.
   * @param initialState.zoomScale - Optional initial zoom factor (pixels per millisecond).
   * @param initialState.scrollLeft - Optional initial horizontal scroll pan in pixels.
   * @param initialState.scrollTop - Optional initial vertical scroll pan in pixels.
   * @param initialState.playheadTime - Optional initial playback cursor timestamp in milliseconds.
   */
  constructor(initialState: {
    tracks: Track[];
    clipGroups?: TimelineClipGroup[];
    markers?: Marker[];
    zoomScale?: number;
    scrollLeft?: number;
    scrollTop?: number;
    playheadTime?: RationalTime;
    duration?: RationalTime;
    zoomConstraints?: TimelineZoomConstraints;
    snapEnabled?: boolean;
    snapThresholdPixels?: number;
    editPolicy?: TimelineEditPolicy;
    keyframeProperties?: TimelineKeyframePropertyDefinition[];
  }) {
    super();
    assertPositiveTimelineNumber(initialState.zoomScale ?? 100, 'initialState.zoomScale');
    assertNonNegativeTimelineNumber(initialState.scrollLeft ?? 0, 'initialState.scrollLeft');
    assertNonNegativeTimelineNumber(initialState.scrollTop ?? 0, 'initialState.scrollTop');
    assertNonNegativeTimelineNumber(
      initialState.snapThresholdPixels ?? 10,
      'initialState.snapThresholdPixels'
    );
    if (initialState.playheadTime !== undefined) {
      assertValidRationalTime(initialState.playheadTime, 'initialState.playheadTime');
    }
    if (initialState.duration !== undefined) {
      assertValidRationalTime(initialState.duration, 'initialState.duration');
    }
    this.zoomConstraints = this.resolveZoomConstraints(initialState.zoomConstraints);
    this.editPolicy = initialState.editPolicy;
    this.registerKeyframeProperties(initialState.keyframeProperties ?? []);
    this.state = {
      tracks: createTrackSnapshots(initialState.tracks),
      clipGroups: createClipGroupSnapshots(initialState.clipGroups),
      contentRevision: 0,
      playheadTime: initialState.playheadTime ?? { v: 0, r: 24000 },
      zoomScale: initialState.zoomScale ?? 100, // 100 px per second
      scrollLeft: initialState.scrollLeft ?? 0,
      scrollTop: initialState.scrollTop ?? 0,
      snapEnabled: initialState.snapEnabled ?? true,
      snapThresholdPixels: initialState.snapThresholdPixels ?? 10,
      snapFeedback: emptyTimelineSnapFeedback,
      clipDropFeedback: emptyTimelineClipDropFeedback,
      markers: createMarkerSnapshots(initialState.markers),
      playing: false,
      playbackRate: 1.0,
      duration: initialState.duration,
    };
    this.playbackManager = new PlaybackManager(this);
    this.historyManager = new HistoryManager(this);
    this.clipboardManager = new ClipboardManager(this);
    this.normalizeClipGroups();
    this.validateRegisteredClipKeyframes();

    if (this.state.duration !== undefined || this.hasZoomConstraints()) {
      this.state.zoomScale = this.clampZoomScale(this.state.zoomScale);
      this.state.scrollLeft = Math.max(0, Math.min(this.state.scrollLeft, this.maxScrollLeft));
    }
    this.clampScrollTop();
    this.snapshot();
  }

  /**
   * Current mutable track list owned by the engine.
   */
  get tracks() {
    return this.state.tracks;
  }

  /**
   * Current clip groups owned by the engine.
   */
  get clipGroups() {
    return this.state.clipGroups;
  }

  /**
   * Monotonic revision for changes that can affect active layer lookup.
   */
  get contentRevision() {
    return this.state.contentRevision;
  }

  /**
   * Current transient impacts for the active live edit interaction.
   *
   * Returns null when no live edit is currently affecting other clips.
   */
  getEditImpacts(): TimelineEditImpacts | null {
    return this.editImpacts;
  }

  /**
   * Current transient preview for the active command-layer edit.
   *
   * Returns null when no command preview is active.
   */
  getEditPreview(): TimelineEditPreview | null {
    return this.editPreview;
  }

  /**
   * Replaces the app-defined edit policy used by command validation.
   *
   * @param policy - New policy, or undefined to use only built-in engine validation.
   */
  setEditPolicy(policy: TimelineEditPolicy | undefined) {
    this.editPolicy = policy;
  }

  /**
   * Registers one scalar keyframe property definition.
   */
  registerKeyframeProperty(definition: TimelineKeyframePropertyDefinition) {
    this.keyframeProperties.register(definition);
  }

  /**
   * Registers scalar keyframe property definitions.
   */
  registerKeyframeProperties(definitions: TimelineKeyframePropertyDefinition[]) {
    this.keyframeProperties.registerMany(definitions);
  }

  /**
   * Returns one registered scalar keyframe property definition.
   */
  getKeyframePropertyDefinition(
    property: TimelineKeyframePropertyId
  ): TimelineRegisteredKeyframePropertyDefinition | null {
    return this.keyframeProperties.get(property);
  }

  /**
   * Returns whether a scalar keyframe property is registered.
   */
  hasKeyframeProperty(property: TimelineKeyframePropertyId) {
    return this.keyframeProperties.has(property);
  }

  /**
   * Returns all registered scalar keyframe property definitions.
   */
  listKeyframeProperties(): TimelineRegisteredKeyframePropertyDefinition[] {
    return this.keyframeProperties.list();
  }

  /**
   * Current transient drop feedback for the active clip body drag interaction.
   */
  getClipDropFeedback(): TimelineClipDropFeedback {
    return this.state.clipDropFeedback;
  }

  /**
   * Publishes transient drop feedback for renderer and headless UI consumers.
   */
  setClipDropFeedback(feedback: TimelineClipDropFeedback) {
    const nextFeedback = createClipDropFeedbackSnapshot(feedback);
    if (isSameClipDropFeedback(this.state.clipDropFeedback, nextFeedback)) {
      return;
    }

    this.state.clipDropFeedback = nextFeedback;
    this.emit('clip:drop-feedback', this.getClipDropFeedback());
    this.emit('render');
  }

  /**
   * Clears transient drop feedback for the active clip body drag interaction.
   */
  clearClipDropFeedback() {
    if (!hasClipDropFeedback(this.state.clipDropFeedback)) {
      return;
    }

    this.state.clipDropFeedback = emptyTimelineClipDropFeedback;
    this.emit('clip:drop-feedback', this.getClipDropFeedback());
    this.emit('render');
  }

  /**
   * Current playhead position.
   */
  get playheadTime() {
    return this.state.playheadTime;
  }

  /**
   * Current horizontal zoom scale in pixels per second.
   */
  get zoomScale() {
    return this.state.zoomScale;
  }

  /**
   * Current minimum zoom scale in pixels per second.
   *
   * This preserves the content-fit floor so users cannot zoom out past the
   * current duration/content bounds.
   */
  get minZoomScale() {
    const viewportWidth = this.state.viewportWidth || 1000;
    const contentTime = toSeconds(this.maxContentTime);
    const contentFitScale = contentTime > 0 ? viewportWidth / contentTime : 0;
    return Math.max(contentFitScale, this.zoomConstraints.minZoomScale ?? 0);
  }

  /**
   * Current maximum zoom scale in pixels per second.
   *
   * When a frame-rate cap is lower than the content-fit floor, the content-fit
   * floor wins so zoom never violates viewport bounds.
   */
  get maxZoomScale() {
    return Math.max(this.minZoomScale, this.configuredMaxZoomScale);
  }

  /**
   * Current horizontal scroll offset in pixels.
   */
  get scrollLeft() {
    return this.state.scrollLeft;
  }

  /**
   * Current vertical scroll offset in pixels.
   */
  get scrollTop() {
    return this.state.scrollTop;
  }

  /**
   * Whether magnetic snapping is enabled.
   */
  get isSnappingEnabled() {
    return this.state.snapEnabled;
  }

  /**
   * Magnetic snap radius in screen pixels.
   */
  get snapThresholdPixels() {
    return this.state.snapThresholdPixels;
  }

  /**
   * Enables or disables magnetic snapping.
   *
   * @param enabled - Next magnetic snapping state.
   */
  setSnappingEnabled(enabled: boolean) {
    this.state.snapEnabled = enabled;
    if (!enabled) {
      this.publishSnapFeedback(emptyTimelineSnapFeedback);
    }
    this.emit('state:settled');
  }

  /**
   * Sets the magnetic snap radius in screen pixels.
   *
   * @param thresholdPixels - New snap threshold in pixels.
   */
  setSnapThresholdPixels(thresholdPixels: number) {
    assertNonNegativeTimelineNumber(thresholdPixels, 'thresholdPixels');
    this.state.snapThresholdPixels = Math.max(0, thresholdPixels);
    this.emit('state:settled');
  }

  private get snapThresholdSeconds() {
    return this.state.snapThresholdPixels / Math.max(this.zoomScale, 0.1);
  }

  private publishSnapFeedback(feedback: TimelineSnapFeedback) {
    const previous = this.state.snapFeedback;
    const sameTarget = previous.target?.id === feedback.target?.id;
    const sameLines =
      previous.lines.length === feedback.lines.length &&
      previous.lines.every((line, index) => line === feedback.lines[index]);

    if (sameTarget && sameLines) {
      return;
    }

    this.state.snapFeedback = {
      lines: [...feedback.lines],
      target: feedback.target,
    };
    this.emit('snap:change', this.state.snapFeedback);
  }

  private createBuiltInSnapTargets(options: SnapPreparationOptions = {}) {
    const targets: TimelineSnapTarget[] = [
      {
        id: 'origin',
        kind: 'origin',
        time: fromSeconds(0, this.playheadTime.r),
        priority: 1,
        label: 'Timeline start',
      },
      {
        id: 'playhead',
        kind: 'playhead',
        time: this.playheadTime,
        priority: 2,
        label: 'Playhead',
      },
    ];

    if (this.state.inPoint !== undefined && !options.ignoreInPoint) {
      targets.push({
        id: 'in-point',
        kind: 'in-point',
        time: this.state.inPoint,
        priority: 3,
        label: 'In point',
      });
    }

    if (this.state.outPoint !== undefined && !options.ignoreOutPoint) {
      targets.push({
        id: 'out-point',
        kind: 'out-point',
        time: this.state.outPoint,
        priority: 3,
        label: 'Out point',
      });
    }

    for (const marker of this.state.markers ?? []) {
      if (marker.snap === false) {
        continue;
      }
      targets.push({
        id: `marker:${marker.id}`,
        kind: 'marker',
        time: marker.time,
        ownerId: marker.id,
        priority: typeof marker.snap === 'object' ? marker.snap.priority : 4,
        label: marker.label,
      });
    }

    for (const track of this.state.tracks) {
      if (track.snap === false) {
        continue;
      }

      const trackSnap = typeof track.snap === 'object' ? track.snap : {};
      if (trackSnap.clips === false) {
        continue;
      }

      for (const clip of track.clips) {
        if (clip.id === options.ignoreClipId || clip.disabled || clip.snap === false) {
          continue;
        }

        const clipSnap = typeof clip.snap === 'object' ? clip.snap : {};
        const priority = clipSnap.priority ?? 5;

        if (trackSnap.clipStart !== false && clipSnap.start !== false) {
          targets.push({
            id: `clip-start:${clip.id}`,
            kind: 'clip-start',
            time: clip.timelineStart,
            ownerId: clip.id,
            trackId: track.id,
            priority,
            label: clip.label,
          });
        }

        if (trackSnap.clipEnd !== false && clipSnap.end !== false) {
          targets.push({
            id: `clip-end:${clip.id}`,
            kind: 'clip-end',
            time: clip.timelineEnd,
            ownerId: clip.id,
            trackId: track.id,
            priority,
            label: clip.label,
          });
        }
      }
    }

    return targets;
  }

  /**
   * Registers a runtime snap target provider.
   *
   * @param provider - Function that returns app-defined snap targets for the next interaction.
   * @returns Unsubscribe function that removes the provider.
   */
  registerSnapProvider(provider: TimelineSnapProvider) {
    this.snapProviders.add(provider);
    return () => {
      this.snapProviders.delete(provider);
    };
  }

  /**
   * Rebuilds snap targets for an upcoming drag, trim, or range-boundary gesture.
   *
   * @param ignoreClipIdOrOptions - Optional clip id or snap-target exclusions so a dragged item
   * does not snap to itself.
   */
  prepareSnapping(ignoreClipIdOrOptions?: string | SnapPreparationOptions) {
    this.snapIndex.clear();
    if (!this.isSnappingEnabled) {
      this.publishSnapFeedback(emptyTimelineSnapFeedback);
      return;
    }

    const options =
      typeof ignoreClipIdOrOptions === 'string'
        ? { ignoreClipId: ignoreClipIdOrOptions }
        : (ignoreClipIdOrOptions ?? {});

    const providerContext: TimelineSnapProviderContext = {
      ...options,
      state: this.state,
      zoomScale: this.zoomScale,
      thresholdSeconds: this.snapThresholdSeconds,
    };
    const targets = this.createBuiltInSnapTargets(options);

    for (const provider of this.snapProviders) {
      targets.push(...provider(providerContext));
    }

    this.snapIndex.build(targets);
  }

  /**
   * Resolves a candidate timeline time against the prepared snap index.
   *
   * @param time - Candidate timeline time.
   * @param publishFeedback - Whether to publish feedback for the result. Defaults to true.
   * @returns Snap result when a target is within threshold, otherwise null.
   */
  resolveSnap(time: RationalTime, publishFeedback = true): TimelineSnapResult | null {
    if (!this.isSnappingEnabled) {
      if (publishFeedback) {
        this.publishSnapFeedback(emptyTimelineSnapFeedback);
      }
      return null;
    }

    const result = this.snapIndex.findNearest(time, this.snapThresholdSeconds);
    if (publishFeedback) {
      this.publishSnapFeedback(result?.feedback ?? emptyTimelineSnapFeedback);
    }
    return result;
  }

  /**
   * Sets or clears the in-point boundary.
   *
   * @param time - New in-point time, or `undefined` to clear it.
   * @param snap - Whether to snap the boundary to nearby indexed edges.
   */
  setInPoint(time: RationalTime | undefined, snap?: boolean) {
    if (time !== undefined) {
      assertValidRationalTime(time, 'time');
    }
    if (snap && time !== undefined) {
      time = this.resolveSnap(time)?.snappedTime ?? time;
    } else {
      this.publishSnapFeedback(emptyTimelineSnapFeedback);
    }

    if (
      time !== undefined &&
      this.state.outPoint !== undefined &&
      Math.abs(toSeconds(time) - toSeconds(this.state.outPoint)) <= 0.01
    ) {
      this.clearInOutPoints();
      return;
    }

    this.state.inPoint = time;
    this.emit('state:inOut', { state: this.state });
    this.emit('render');
  }

  /**
   * Sets or clears the out-point boundary.
   *
   * @param time - New out-point time, or `undefined` to clear it.
   * @param snap - Whether to snap the boundary to nearby indexed edges.
   */
  setOutPoint(time: RationalTime | undefined, snap?: boolean) {
    if (time !== undefined) {
      assertValidRationalTime(time, 'time');
    }
    if (snap && time !== undefined) {
      time = this.resolveSnap(time)?.snappedTime ?? time;
    } else {
      this.publishSnapFeedback(emptyTimelineSnapFeedback);
    }

    if (
      time !== undefined &&
      this.state.inPoint !== undefined &&
      Math.abs(toSeconds(time) - toSeconds(this.state.inPoint)) <= 0.01
    ) {
      this.clearInOutPoints();
      return;
    }

    this.state.outPoint = time;
    this.emit('state:inOut', { state: this.state });
    this.emit('render');
  }

  /**
   * Clears both in-point and out-point boundaries.
   */
  clearInOutPoints() {
    this.state.inPoint = undefined;
    this.state.outPoint = undefined;
    this.emit('state:inOut', { state: this.state });
    this.emit('render');
  }

  /**
   * Updates engine-owned zoom constraints and re-clamps the current viewport.
   *
   * @param constraints - New zoom constraints, or omitted to clear app constraints.
   */
  setZoomConstraints(constraints: TimelineZoomConstraints = {}) {
    this.zoomConstraints = this.resolveZoomConstraints(constraints);
    this.setZoomScale(this.state.zoomScale);
  }

  // --- Helpers ---

  private hasZoomConstraints() {
    return (
      this.zoomConstraints.frameRate !== undefined ||
      this.zoomConstraints.maxPixelsPerFrame !== undefined ||
      this.zoomConstraints.minZoomScale !== undefined ||
      this.zoomConstraints.maxZoomScale !== undefined
    );
  }

  private resolveZoomConstraints(
    constraints: TimelineZoomConstraints | undefined
  ): TimelineZoomConstraints {
    if (!constraints) {
      return {};
    }

    if (constraints.frameRate !== undefined) {
      resolveTimecodeFrameRate(constraints.frameRate);
    }

    this.validatePositiveZoomConstraint(
      constraints.maxPixelsPerFrame,
      'maxPixelsPerFrame must be a positive finite value.'
    );
    this.validatePositiveZoomConstraint(
      constraints.minZoomScale,
      'minZoomScale must be a positive finite value.'
    );
    this.validatePositiveZoomConstraint(
      constraints.maxZoomScale,
      'maxZoomScale must be a positive finite value.'
    );

    return { ...constraints };
  }

  private validatePositiveZoomConstraint(value: number | undefined, message: string) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
      throw new RangeError(message);
    }
  }

  private get configuredMaxZoomScale() {
    let maxZoomScale = this.zoomConstraints.maxZoomScale ?? Number.POSITIVE_INFINITY;

    if (this.zoomConstraints.frameRate !== undefined) {
      const fps = resolveTimecodeFrameRate(this.zoomConstraints.frameRate);
      const maxPixelsPerFrame =
        this.zoomConstraints.maxPixelsPerFrame ?? defaultTimelineMaxPixelsPerFrame;
      maxZoomScale = Math.min(maxZoomScale, fps * maxPixelsPerFrame);
    }

    return maxZoomScale;
  }

  private clampZoomScale(scale: number) {
    return Math.max(this.minZoomScale, Math.min(scale, this.maxZoomScale));
  }

  /**
   * Locates a clip and returns its containing track and indexes.
   *
   * @param clipId - Clip id to look up.
   * @returns Clip lookup details, or `undefined` when the clip is not found.
   */
  getClip(
    clipId: string
  ): { track: Track; clip: Clip; trackIndex: number; clipIndex: number } | undefined {
    for (let trackIndex = 0; trackIndex < this.state.tracks.length; trackIndex++) {
      const track = this.state.tracks[trackIndex];
      for (let clipIndex = 0; clipIndex < track.clips.length; clipIndex++) {
        const clip = track.clips[clipIndex];
        if (clip.id === clipId) {
          return { track, clip, trackIndex, clipIndex };
        }
      }
    }
    return undefined;
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

    let nextTime =
      input.time === undefined
        ? keyframe.time
        : this.clampKeyframeTimeToClip(found.clip, input.time);
    if (input.time !== undefined) {
      assertValidRationalTime(input.time, 'input.time');
    }

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

  /**
   * Returns viewport rectangles for every track row in track order.
   *
   * @param options - Optional ruler, track metrics, and viewport width.
   * @returns Track row entries matching canvas layout.
   */
  getTrackRects(options: TimelineTrackGeometryOptions = {}): TimelineTrackRect[] {
    const resolvedGeometry = resolveTimelineInteractionGeometry(options);
    const viewportWidth = Math.max(
      0,
      options.viewportWidth ?? this.state.viewportWidth ?? defaultTimelineViewportWidth
    );
    const scrollTop = this.state.scrollTop;
    const trackRects: TimelineTrackRect[] = [];
    let y = resolvedGeometry.rulerHeight - scrollTop;

    for (let trackIndex = 0; trackIndex < this.state.tracks.length; trackIndex++) {
      const track = this.state.tracks[trackIndex];
      const height = this.getTrackViewportHeight(track, resolvedGeometry);
      trackRects.push(this.createTrackViewportRect(track, trackIndex, y, height, viewportWidth));
      y += height;
    }

    return trackRects;
  }

  /**
   * Hit-tests timeline tracks in viewport coordinates, matching canvas layout.
   *
   * @param input - Viewport point and optional geometry overrides.
   * @returns The matching track row, or null for blank/ruler space.
   */
  getTrackAtPoint<TrackKind = string>(
    input: TrackHitTestInput
  ): TimelineTrackHitTestResult<TrackKind> | null {
    const resolvedGeometry = resolveTimelineInteractionGeometry(input);
    if (input.y < resolvedGeometry.rulerHeight) {
      return null;
    }

    for (const rect of this.getTrackRects(input)) {
      const track = this.getTracks<TrackKind>()[rect.trackIndex];
      if (track === undefined) {
        continue;
      }
      const insideX =
        input.x === undefined || (input.x >= rect.x && input.x <= rect.x + rect.width);

      if (insideX && input.y >= rect.y && input.y < rect.y + rect.height) {
        return { track, trackIndex: rect.trackIndex, rect };
      }
    }

    return null;
  }

  /**
   * Returns the current viewport rectangle for a clip, matching canvas track layout.
   *
   * @param clipId - Clip id to locate.
   * @param geometry - Optional ruler and track metrics used by the interaction layer.
   * @returns Viewport rectangle for the clip, or `null` when the clip is missing.
   */
  getClipRect(clipId: string, geometry: TimelineInteractionGeometry = {}): ClipViewportRect | null {
    const resolvedGeometry = resolveTimelineInteractionGeometry(geometry);
    let y = resolvedGeometry.rulerHeight - this.state.scrollTop;

    for (let trackIndex = 0; trackIndex < this.state.tracks.length; trackIndex++) {
      const track = this.state.tracks[trackIndex];
      const trackHeight = this.getTrackViewportHeight(track, resolvedGeometry);

      for (let clipIndex = 0; clipIndex < track.clips.length; clipIndex++) {
        const clip = track.clips[clipIndex];
        if (clip.id !== clipId) {
          continue;
        }

        return this.createClipViewportRect(track, clip, trackIndex, clipIndex, y, trackHeight);
      }

      y += trackHeight;
    }

    return null;
  }

  /**
   * Returns viewport rectangles for every clip in track order.
   *
   * This is the canonical geometry source for DOM clip rendering and custom
   * canvas layers. Pointer hit testing keeps a direct low-allocation path.
   *
   * @param options - Optional ruler and track metrics used to align with the renderer.
   * @returns Clip entries with viewport rectangles and edit/display state.
   */
  getClipRects<TrackKind = string>(
    options: TimelineClipGeometryOptions = {}
  ): TimelineClipRect<TrackKind>[] {
    const clipRects: TimelineClipRect<TrackKind>[] = [];

    this.forEachTimelineClipGeometry<TrackKind>(
      options,
      (track, clip, trackIndex, clipIndex, rect) => {
        clipRects.push(this.createTimelineClipRect(track, clip, trackIndex, clipIndex, rect));
      }
    );

    return clipRects;
  }

  /**
   * Returns clips intersecting the current horizontal viewport, plus optional overscan.
   *
   * The returned visible ranges map clipped viewport pixels back to timeline and
   * source-media times so custom renderers can draw cached thumbnails, waveforms,
   * annotations, or heatmaps without duplicating timeline math.
   *
   * @param options - Viewport, overscan, and optional geometry settings.
   * @returns Viewport-intersecting clip entries in track order.
   */
  getVisibleTimelineClips<TrackKind = string>(
    options: VisibleTimelineClipOptions = {}
  ): VisibleTimelineClip<TrackKind>[] {
    const resolvedGeometry = resolveTimelineInteractionGeometry(options);
    const viewportWidth = Math.max(
      0,
      options.viewportWidth ?? this.state.viewportWidth ?? defaultTimelineViewportWidth
    );
    const viewportHeight =
      options.viewportHeight === undefined ? undefined : Math.max(0, options.viewportHeight);
    const overscanPixels = Math.max(0, options.overscanPixels ?? 0);
    const minX = -overscanPixels;
    const maxX = viewportWidth + overscanPixels;
    const minY = resolvedGeometry.rulerHeight - overscanPixels;
    const maxY = viewportHeight === undefined ? undefined : viewportHeight + overscanPixels;
    const visibleClips: VisibleTimelineClip<TrackKind>[] = [];

    this.forEachTimelineClipGeometry<TrackKind>(
      options,
      (track, clip, trackIndex, clipIndex, rect) => {
        const rectRight = rect.x + rect.width;
        const rectBottom = rect.y + rect.height;

        if (rectRight < minX || rect.x > maxX) {
          return;
        }
        if (maxY !== undefined && (rectBottom < minY || rect.y > maxY)) {
          return;
        }

        const visibleLeft = Math.max(rect.x, minX);
        const visibleRight = Math.min(rectRight, maxX);
        const visibleTop = maxY === undefined ? rect.y : Math.max(rect.y, minY);
        const visibleBottom = maxY === undefined ? rectBottom : Math.min(rectBottom, maxY);
        const visibleWidth = Math.max(0, visibleRight - visibleLeft);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        const visibleTimelineStartTime = maxRational(
          clip.timelineStart,
          this.pixelToTime(visibleLeft, clip.timelineStart.r)
        );
        const visibleTimelineEndTime = minRational(
          clip.timelineEnd,
          this.pixelToTime(visibleRight, clip.timelineEnd.r)
        );

        if (compareRational(visibleTimelineEndTime, visibleTimelineStartTime) <= 0) {
          return;
        }

        const visibleSourceStartTime = addRational(
          clip.sourceStart,
          subRational(visibleTimelineStartTime, clip.timelineStart)
        );
        const visibleSourceEndTime = addRational(
          clip.sourceStart,
          subRational(visibleTimelineEndTime, clip.timelineStart)
        );
        const clipRect = this.createTimelineClipRect(track, clip, trackIndex, clipIndex, rect);

        visibleClips.push({
          ...clipRect,
          visibleRect: {
            clipId: clip.id,
            trackId: track.id,
            trackIndex,
            clipIndex,
            x: normalizeViewportCoordinate(visibleLeft),
            y: normalizeViewportCoordinate(visibleTop),
            width: normalizeViewportCoordinate(visibleWidth),
            height: normalizeViewportCoordinate(visibleHeight),
          },
          visibleTimelineStartTime,
          visibleTimelineEndTime,
          visibleSourceStartTime,
          visibleSourceEndTime,
        });
      }
    );

    return visibleClips;
  }

  /**
   * Hit-tests timeline clips in viewport coordinates, matching canvas track layout.
   *
   * Clip bodies remain selectable even when their track is locked or the clip is
   * non-editable; edge/body edit regions are only reported when the clip can be edited.
   *
   * @param input - Viewport point and optional geometry overrides.
   * @returns The topmost matching clip hit, or `null` for blank/ruler space.
   */
  getClipAtPoint(input: ClipHitTestInput): ClipHitTestResult | null {
    const resolvedGeometry = resolveTimelineInteractionGeometry(input);
    if (input.y < resolvedGeometry.rulerHeight) {
      return null;
    }

    let trackY = resolvedGeometry.rulerHeight - this.state.scrollTop;

    for (let trackIndex = 0; trackIndex < this.state.tracks.length; trackIndex++) {
      const track = this.state.tracks[trackIndex];
      const trackHeight = this.getTrackViewportHeight(track, resolvedGeometry);
      const trackBottom = trackY + trackHeight;

      if (input.y >= trackY && input.y < trackBottom) {
        return (
          this.findClipHitInTrack(track, trackIndex, trackY, trackHeight, resolvedGeometry, input, {
            selectedOnly: true,
          }) ??
          this.findClipHitInTrack(track, trackIndex, trackY, trackHeight, resolvedGeometry, input, {
            selectedOnly: false,
            skipSelected: true,
          })
        );
      }

      trackY = trackBottom;
    }

    return null;
  }

  private getTrackViewportHeight<TrackKind>(
    track: Track<TrackKind>,
    geometry: ResolvedTimelineInteractionGeometry
  ): number {
    return Math.floor(
      track.collapsed ? geometry.collapsedTrackHeight : (track.height ?? geometry.trackHeight)
    );
  }

  private sortTrackClips(track: Track) {
    track.clips.sort((a, b) => compareRational(a.timelineStart, b.timelineStart));
  }

  private forEachTimelineClipGeometry<TrackKind>(
    options: TimelineClipGeometryOptions,
    visit: (
      track: Track<TrackKind>,
      clip: Clip,
      trackIndex: number,
      clipIndex: number,
      rect: ClipViewportRect
    ) => void
  ): void {
    const resolvedGeometry = resolveTimelineInteractionGeometry(options);
    let y = resolvedGeometry.rulerHeight - this.state.scrollTop;

    for (let trackIndex = 0; trackIndex < this.state.tracks.length; trackIndex++) {
      const track = this.getTracks<TrackKind>()[trackIndex];
      const trackHeight = this.getTrackViewportHeight(track, resolvedGeometry);

      for (let clipIndex = 0; clipIndex < track.clips.length; clipIndex++) {
        const clip = track.clips[clipIndex];
        const rect = this.createClipViewportRect(
          track,
          clip,
          trackIndex,
          clipIndex,
          y,
          trackHeight
        );

        visit(track, clip, trackIndex, clipIndex, rect);
      }

      y += trackHeight;
    }
  }

  private findClipHitInTrack(
    track: Track,
    trackIndex: number,
    trackY: number,
    trackHeight: number,
    geometry: ResolvedTimelineInteractionGeometry,
    input: ClipHitTestInput,
    options: { selectedOnly?: boolean; skipSelected?: boolean } = {}
  ): ClipHitTestResult | null {
    for (let clipIndex = track.clips.length - 1; clipIndex >= 0; clipIndex--) {
      const clip = track.clips[clipIndex];
      if (options.selectedOnly && !clip.selected) {
        continue;
      }
      if (options.skipSelected && clip.selected) {
        continue;
      }

      const rect = this.createClipViewportRect(
        track,
        clip,
        trackIndex,
        clipIndex,
        trackY,
        trackHeight
      );

      if (input.x < rect.x || input.x > rect.x + rect.width) {
        continue;
      }

      const canMove = !track.locked && clip.movable !== false;
      const canTrim = !track.locked && clip.resizable !== false;
      let region: ClipHitRegion = 'body';

      if (canTrim) {
        const baseThreshold =
          input.pointerType === 'touch' ? geometry.touchEdgeThreshold : geometry.edgeThreshold;
        const edgeThreshold = Math.min(baseThreshold, rect.width / 3);

        if (input.x - rect.x < edgeThreshold) {
          region = 'start-edge';
        } else if (rect.x + rect.width - input.x < edgeThreshold) {
          region = 'end-edge';
        }
      }

      return {
        track,
        clip,
        trackIndex,
        clipIndex,
        region,
        rect,
        canMove,
        canTrim,
      };
    }

    return null;
  }

  private createClipViewportRect<TrackKind>(
    track: Track<TrackKind>,
    clip: Clip,
    trackIndex: number,
    clipIndex: number,
    y: number,
    height: number
  ): ClipViewportRect {
    const x = this.timeToPixel(clip.timelineStart);
    const endX = this.timeToPixel(clip.timelineEnd);

    return {
      clipId: clip.id,
      trackId: track.id,
      trackIndex,
      clipIndex,
      x,
      y,
      width: endX - x,
      height,
    };
  }

  private createTrackViewportRect<TrackKind>(
    track: Track<TrackKind>,
    trackIndex: number,
    y: number,
    height: number,
    width: number
  ): TimelineTrackRect {
    return {
      trackId: track.id,
      trackIndex,
      x: 0,
      y,
      width,
      height,
    };
  }

  private createTimelineClipRect<TrackKind>(
    track: Track<TrackKind>,
    clip: Clip,
    trackIndex: number,
    clipIndex: number,
    rect: ClipViewportRect
  ): TimelineClipRect<TrackKind> {
    return {
      clip,
      track,
      trackIndex,
      clipIndex,
      rect,
      sourceRange: createClipSourceRange(clip),
      canMove: !track.locked && clip.movable !== false,
      canTrim: !track.locked && clip.resizable !== false,
      muted: track.muted,
      visible: track.visible,
      locked: track.locked,
      disabled: clip.disabled === true,
    };
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

  private validateRegisteredClipKeyframes() {
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

  /**
   * Marks timeline content as changed and notifies subscribers.
   *
   * Use this after external metadata that affects rendering changes without a
   * structural timeline edit, such as waveform availability, thumbnails, or
   * cached analysis keyed by clip id.
   */
  invalidateContent() {
    this.state.contentRevision = this.contentRevision + 1;
    this.emit('content:change', this.state.contentRevision);
  }

  /**
   * Returns enabled clips under a timeline time, ordered by track and clip order.
   *
   * Hidden or muted tracks and disabled clips are excluded so preview and playback
   * integrations can pick sources using the same visibility rules. Clip
   * intervals are half-open: active at `timelineStart` and inactive at
   * `timelineEnd`.
   *
   * @param time - Timeline time to inspect. Defaults to the current playhead.
   * @returns Active clips with computed source-media timestamps.
   */
  getActiveClips(time: RationalTime = this.state.playheadTime): ActiveClip[] {
    const activeClips: ActiveClip[] = [];

    for (const track of this.state.tracks) {
      if (!track.visible || track.muted) {
        continue;
      }
      for (const clip of track.clips) {
        if (clip.disabled) {
          continue;
        }
        const activeClip = this.createActiveClip(track, clip, time);
        if (activeClip !== undefined) {
          activeClips.push(activeClip);
        }
      }
    }

    return activeClips;
  }

  /**
   * Returns the first active clip matching an active layer query.
   *
   * @param query - Optional timeline time, track kind, source id, and custom predicate.
   * @returns First matching active clip in track and clip order.
   */
  getActiveClip(query: ActiveClipQuery = {}): ActiveClip | undefined {
    const { time = this.state.playheadTime, trackKind, sourceId, predicate } = query;
    return this.getActiveClips(time).find((activeClip) => {
      return this.matchesActiveLayerSelector(activeClip, { trackKind, sourceId, predicate });
    });
  }

  /**
   * Finds the clips active at a timeline time and groups them by named layer selectors.
   *
   * Use this for preview, playback, subtitle, and effect integrations that need
   * to know which layer clips should be rendered or synced at the playhead. Hidden
   * or muted tracks and disabled clips are excluded. The result preserves every match in
   * `layers`, deduplicates matches in `all`, and exposes `primary` as a
   * first-match convenience for each requested layer.
   *
   * @param options - Timeline time and named active layer selectors.
   * @returns Active layer result for the requested layers.
   */
  getActiveLayers<LayerName extends string = string>(
    options: ActiveLayerOptions<LayerName>
  ): ActiveLayerResult<LayerName> {
    const time = options.time ?? this.state.playheadTime;
    const activeClips = this.getActiveClips(time);
    const layers = {} as Record<LayerName, ActiveClip[]>;
    const primary: Partial<Record<LayerName, ActiveClip>> = {};
    const matchedClips = new Map<string, ActiveClip>();

    for (const layerName of Object.keys(options.layers) as LayerName[]) {
      const selector = options.layers[layerName];
      const layerClips = activeClips.filter((activeClip) =>
        this.matchesActiveLayerSelector(activeClip, selector)
      );
      layers[layerName] = layerClips;
      if (layerClips[0] !== undefined) {
        primary[layerName] = layerClips[0];
      }
      for (const activeClip of layerClips) {
        if (!matchedClips.has(activeClip.clip.id)) {
          matchedClips.set(activeClip.clip.id, activeClip);
        }
      }
    }

    const all = [...matchedClips.values()];
    const byTrack = this.groupActiveClipsByTrack(all);

    return {
      time,
      all,
      byTrack,
      layers,
      primary,
      hasActiveClips: all.length > 0,
      firstContentTime: this.getFirstContentTime({ layers: options.layers }),
    };
  }

  /**
   * Finds the earliest clip start matching any requested layer.
   *
   * @param options - Named layer selectors.
   * @returns Earliest matching timeline start, or `undefined` when nothing matches.
   */
  getFirstContentTime<LayerName extends string = string>(
    options: Pick<ActiveLayerOptions<LayerName>, 'layers'>
  ): RationalTime | undefined {
    let firstContentTime: RationalTime | undefined;

    for (const track of this.state.tracks) {
      if (!track.visible || track.muted) {
        continue;
      }

      for (const clip of track.clips) {
        if (clip.disabled) {
          continue;
        }

        const activeClip = this.createActiveClip(track, clip, clip.timelineStart);
        if (
          activeClip === undefined ||
          !Object.values<ActiveLayerSelector>(options.layers).some((selector) =>
            this.matchesActiveLayerSelector(activeClip, selector)
          )
        ) {
          continue;
        }

        if (
          firstContentTime === undefined ||
          compareRational(clip.timelineStart, firstContentTime) < 0
        ) {
          firstContentTime = clip.timelineStart;
        }
      }
    }

    return firstContentTime;
  }

  /**
   * Groups active clips by containing track id.
   *
   * @param time - Timeline time to inspect. Defaults to the current playhead.
   * @returns Map of track id to active clips on that track.
   */
  getActiveClipsByTrack(time: RationalTime = this.state.playheadTime): Map<string, ActiveClip[]> {
    return this.groupActiveClipsByTrack(this.getActiveClips(time));
  }

  private groupActiveClipsByTrack(activeClips: ActiveClip[]): Map<string, ActiveClip[]> {
    const clipsByTrack = new Map<string, ActiveClip[]>();
    for (const activeClip of activeClips) {
      const trackClips = clipsByTrack.get(activeClip.track.id);
      if (trackClips === undefined) {
        clipsByTrack.set(activeClip.track.id, [activeClip]);
      } else {
        trackClips.push(activeClip);
      }
    }
    return clipsByTrack;
  }

  private matchesActiveLayerSelector(
    activeClip: ActiveClip,
    selector: ActiveLayerSelector
  ): boolean {
    if (selector.trackKind !== undefined && activeClip.track.kind !== selector.trackKind) {
      return false;
    }
    if (selector.sourceId !== undefined && activeClip.clip.sourceId !== selector.sourceId) {
      return false;
    }
    return selector.predicate === undefined || selector.predicate(activeClip);
  }

  private createActiveClip(
    track: Track,
    clip: Clip,
    timelineTime: RationalTime
  ): ActiveClip | undefined {
    const sourceTime = this.timelineTimeToSourceTime(clip, timelineTime);
    const sourceRange = this.getClipSourceRange(clip);
    const syncKey = this.getClipSyncKey(clip);
    if (sourceTime === undefined || sourceRange === undefined || syncKey === undefined) {
      return undefined;
    }

    return {
      track,
      clip,
      timelineTime,
      sourceTime,
      sourceRange,
      syncKey,
    };
  }

  /**
   * Computes the source-media range covered by a clip.
   *
   * @param clipIdOrClip - Clip object or id to inspect.
   * @returns Source range, or `undefined` when the clip is missing.
   */
  getClipSourceRange(clipIdOrClip: string | Clip): ClipSourceRange | undefined {
    const clip = this.resolveClip(clipIdOrClip);
    if (clip === undefined) {
      return undefined;
    }

    return createClipSourceRange(clip);
  }

  /**
   * Returns a stable media sync signature for timing-affecting clip fields.
   *
   * @param clipIdOrClip - Clip object or id to inspect.
   * @returns Sync key, or `undefined` when the clip is missing.
   */
  getClipSyncKey(clipIdOrClip: string | Clip): string | undefined {
    const clip = this.resolveClip(clipIdOrClip);
    if (clip === undefined) {
      return undefined;
    }

    return createClipSyncKey(clip);
  }

  /**
   * Maps a timeline timestamp within a clip to the matching source-media time.
   *
   * @param clipIdOrClip - Clip object or id to map through.
   * @param timelineTime - Timeline time to convert. Defaults to the current playhead.
   * @returns Source time, or `undefined` when the clip is missing or the time is outside the clip.
   */
  timelineTimeToSourceTime(
    clipIdOrClip: string | Clip,
    timelineTime: RationalTime = this.state.playheadTime
  ): RationalTime | undefined {
    const clip = this.resolveClip(clipIdOrClip);
    if (clip === undefined) {
      return undefined;
    }

    return mapTimelineTimeToSourceTime(clip, timelineTime);
  }

  /**
   * Maps a source-media timestamp within a clip back to timeline time.
   *
   * @param clipIdOrClip - Clip object or id to map through.
   * @param sourceTime - Source-media time to convert.
   * @returns Timeline time, or `undefined` when the clip is missing or the source time is outside the clip.
   */
  sourceTimeToTimelineTime(
    clipIdOrClip: string | Clip,
    sourceTime: RationalTime
  ): RationalTime | undefined {
    const clip = this.resolveClip(clipIdOrClip);
    if (clip === undefined) {
      return undefined;
    }

    return mapSourceTimeToTimelineTime(clip, sourceTime);
  }

  private resolveClip(clipIdOrClip: string | Clip): Clip | undefined {
    return typeof clipIdOrClip === 'string' ? this.getClip(clipIdOrClip)?.clip : clipIdOrClip;
  }

  /**
   * Validates an edit command without mutating timeline state.
   *
   * @param command - Command to validate.
   * @returns Built-in and policy validation result.
   */
  validateEdit(command: TimelineEditCommand): TimelineEditValidationResult {
    return this.validateEditCommand(command);
  }

  /**
   * Resolves and publishes a non-mutating preview for an edit command.
   *
   * @param command - Command to preview.
   * @returns Shared preview result for renderer and headless UI consumers.
   */
  previewEdit(command: TimelineEditCommand): TimelineEditPreview {
    const resolved = this.resolveTimelineEdit(command);
    this.editResolution = resolved;
    this.publishEditPreview(resolved.preview);
    return resolved.preview;
  }

  /**
   * Resolves, validates, and commits an edit command as one history entry.
   *
   * @param command - Command to commit.
   * @returns Commit result containing the resolved preview.
   */
  commitEdit(command: TimelineEditCommand): TimelineEditCommitResult {
    const commandFingerprint = createEditCommandFingerprint(command);
    const resolved =
      this.editResolution?.commandFingerprint === commandFingerprint
        ? this.editResolution
        : this.resolveTimelineEdit(command);
    if (!resolved.preview.valid) {
      const rejectedResult: TimelineEditCommitResult = {
        command,
        preview: resolved.preview,
        committed: false,
      };
      this.publishEditPreview(resolved.preview);
      return rejectedResult;
    }

    this.state.tracks = resolved.tracks;
    if (resolved.clipGroups !== undefined) {
      this.state.clipGroups = resolved.clipGroups;
    }
    this.normalizeClipGroups();
    for (const track of this.state.tracks) {
      this.sortTrackClips(track);
    }

    this.invalidateContent();
    this.snapshot();
    this.emitEditCommitEvents(resolved);
    const result: TimelineEditCommitResult = {
      command,
      preview: resolved.preview,
      committed: true,
    };
    this.editPreview = null;
    this.editImpacts = null;
    this.editResolution = null;
    this.publishSnapFeedback(emptyTimelineSnapFeedback);
    this.emit('edit:preview', null);
    this.emit('edit:impacts', null);
    this.emit('edit:commit', result);
    this.emit('state:settled');
    this.emit('render');
    return result;
  }

  /**
   * Clears the active command-layer edit preview and snap guides.
   */
  cancelEdit() {
    this.editPreview = null;
    this.editImpacts = null;
    this.editResolution = null;
    this.publishSnapFeedback(emptyTimelineSnapFeedback);
    this.emit('edit:preview', null);
    this.emit('edit:impacts', null);
    this.emit('state:preview');
    this.emit('render');
  }

  private publishEditPreview(preview: TimelineEditPreview) {
    this.editPreview = preview;
    this.editImpacts = this.createEditImpactsFromPreview(preview);
    if (preview.snap !== null) {
      this.publishSnapFeedback(preview.snap.feedback);
    } else {
      this.publishSnapFeedback(emptyTimelineSnapFeedback);
    }
    this.emit('edit:preview', preview);
    this.emit('edit:impacts', this.editImpacts);
    this.emit('state:preview');
    this.emit('render');
  }

  private createEditImpactsFromPreview(preview: TimelineEditPreview): TimelineEditImpacts | null {
    if (preview.impacts.length === 0) {
      return null;
    }

    const sourceClipId = this.getEditCommandSourceClipId(preview.command);
    const sourceTrackId = this.getEditCommandSourceTrackId(preview.command, sourceClipId);
    return createTimelineEditImpactsSnapshot({
      operation: preview.command.type,
      sourceClipId: sourceClipId ?? null,
      sourceTrackId,
      impacts: preview.impacts,
    });
  }

  private getEditCommandSourceClipId(command: TimelineEditCommand): string | undefined {
    switch (command.type) {
      case 'move':
      case 'trim':
      case 'ripple-trim':
      case 'slip':
      case 'slide':
        return command.clipId;
      case 'split':
        return command.clipIds[0];
      case 'delete-clips':
        return command.clipIds[0];
      case 'roll-trim':
        return command.leftClipId;
      case 'insert':
      case 'overwrite':
        return command.clip.id;
      case 'insert-clip-group':
      case 'overwrite-clip-group':
        return command.placements[0]?.clip.id;
      case 'delete-range':
      case 'lift-range':
        return undefined;
    }
  }

  private getEditCommandSourceTrackId(
    command: TimelineEditCommand,
    sourceClipId: string | undefined
  ): string | null {
    switch (command.type) {
      case 'insert':
      case 'overwrite':
        return command.targetTrackId;
      case 'insert-clip-group':
      case 'overwrite-clip-group':
        return command.placements[0]?.targetTrackId ?? null;
      case 'delete-range':
      case 'lift-range':
        return null;
      case 'move':
      case 'trim':
      case 'ripple-trim':
      case 'slip':
      case 'slide':
      case 'split':
      case 'delete-clips':
      case 'roll-trim':
        return sourceClipId !== undefined ? (this.getClip(sourceClipId)?.track.id ?? null) : null;
    }
  }

  private emitEditCommitEvents(resolved: TimelineResolvedEdit) {
    for (const removed of resolved.removedClipEvents) {
      this.emit('clip:removed', {
        clip: removed.clip,
        reason: removed.reason,
      } satisfies ClipRemovedEvent);
    }

    for (const created of resolved.createdClipEvents) {
      if (created.reason === 'split') {
        continue;
      }
      const event: ClipCreatedEvent = {
        clip: created.clip,
        reason: created.reason,
      };
      if (created.originClipId !== undefined) {
        event.originClipId = created.originClipId;
      }
      this.emit('clip:created', event);
    }

    const { command } = resolved.preview;
    const { preview } = resolved;
    if (resolved.moveResult !== undefined) {
      this.emit('clip:move', { ...resolved.moveResult, phase: 'commit' });
    }

    if (command.type === 'trim' || command.type === 'ripple-trim' || command.type === 'roll-trim') {
      for (const clip of preview.changedClips) {
        this.emit('clip:resize', { clip });
      }
    }
    if (command.type === 'slip') {
      for (const clip of preview.changedClips) {
        this.emit('clip:slip', { clip });
      }
    }
    if (command.type === 'split') {
      for (const created of resolved.createdClipEvents) {
        if (created.originClipId === undefined) {
          continue;
        }
        const left = preview.changedClips.find((clip) => clip.id === created.originClipId);
        if (left !== undefined) {
          this.emit('clip:split', {
            originalId: created.originClipId,
            left,
            right: created.clip,
          } satisfies ClipSplitEvent);
        }
      }
    }
  }

  private resolveTimelineEdit(command: TimelineEditCommand): TimelineResolvedEdit {
    const validation = this.validateEditCommand(command);
    if (!validation.valid) {
      return this.createRejectedResolvedEdit(
        command,
        createTrackSnapshots(this.state.tracks),
        validation
      );
    }

    switch (command.type) {
      case 'move':
        return this.resolveMoveEdit(command);
      case 'trim':
        return this.resolveTrimEdit(command, false);
      case 'ripple-trim':
        return this.resolveTrimEdit(command, true);
      case 'roll-trim':
        return this.resolveRollTrimEdit(command);
      case 'slip':
        return this.resolveSlipEdit(command);
      case 'slide':
        return this.resolveSlideEdit(command);
      case 'split':
        return this.resolveSplitEdit(command);
      case 'delete-clips':
        return this.resolveDeleteClipsEdit(command);
      case 'insert':
        return this.resolveInsertEdit(command);
      case 'insert-clip-group':
        return this.resolveInsertClipGroupEdit(command);
      case 'overwrite':
        return this.resolveOverwriteEdit(command);
      case 'overwrite-clip-group':
        return this.resolveOverwriteClipGroupEdit(command);
      case 'delete-range':
        return this.resolveRangeRemovalEdit(command, command.ripple !== false);
      case 'lift-range':
        return this.resolveRangeRemovalEdit(command, false);
    }
  }

  private createRejectedEditPreview(
    command: TimelineEditCommand,
    validation: TimelineEditValidationResult
  ): TimelineEditPreview {
    return {
      command,
      valid: false,
      reason: validation.reason,
      message: validation.message,
      snap: null,
      changedClips: [],
      createdClips: [],
      removedClips: [],
      affectedRanges: [],
      impacts: [],
    };
  }

  private createResolvedEditPreview(
    command: TimelineEditCommand,
    partial: Omit<TimelineEditPreview, 'command' | 'valid' | 'reason'>
  ): TimelineEditPreview {
    return {
      command,
      valid: true,
      reason: null,
      ...partial,
    };
  }

  private createRejectedResolvedEdit(
    command: TimelineEditCommand,
    tracks: Track[],
    validation: TimelineEditValidationResult
  ): TimelineResolvedEdit {
    return this.createResolvedEdit(
      command,
      tracks,
      this.createRejectedEditPreview(command, validation)
    );
  }

  private createResolvedEdit(
    command: TimelineEditCommand,
    tracks: Track[],
    preview: TimelineEditPreview,
    options: {
      clipGroups?: TimelineClipGroup[];
      moveResult?: TimelineClipMoveResult;
      createdClipEvents?: TimelineCreatedClipEvent[];
      removedClipEvents?: TimelineRemovedClipEvent[];
    } = {}
  ): TimelineResolvedEdit {
    return {
      tracks,
      preview,
      ...(options.clipGroups !== undefined ? { clipGroups: options.clipGroups } : {}),
      commandFingerprint: createEditCommandFingerprint(command),
      ...(options.moveResult !== undefined ? { moveResult: options.moveResult } : {}),
      createdClipEvents: options.createdClipEvents ?? [],
      removedClipEvents: options.removedClipEvents ?? [],
    };
  }

  private validateEditCommand(command: TimelineEditCommand): TimelineEditValidationResult {
    const builtIn = this.validateBuiltInEditCommand(command);
    if (!builtIn.valid) {
      return builtIn;
    }

    const context = this.createPolicyContext(command);
    const placementContexts = this.createPlacementPolicyContexts(command);
    const policyResults: (TimelineEditValidationResult | undefined)[] = [
      this.editPolicy?.validateCommand?.(context),
    ];

    if (
      command.type === 'move' ||
      command.type === 'insert' ||
      command.type === 'insert-clip-group' ||
      command.type === 'overwrite' ||
      command.type === 'overwrite-clip-group'
    ) {
      for (const placementContext of placementContexts) {
        policyResults.push(
          this.editPolicy?.canPlaceClip?.(
            placementContext as TimelineEditPolicyContext<
              | TimelineMoveEditCommand
              | TimelineInsertEditCommand
              | TimelineInsertClipGroupEditCommand
              | TimelineOverwriteEditCommand
              | TimelineOverwriteClipGroupEditCommand
            >
          )
        );
      }
    }
    if (command.type === 'trim' || command.type === 'ripple-trim' || command.type === 'roll-trim') {
      policyResults.push(
        this.editPolicy?.canTrimClip?.(
          context as TimelineEditPolicyContext<
            TimelineTrimEditCommand | TimelineRippleTrimEditCommand | TimelineRollTrimEditCommand
          >
        )
      );
    }
    if (
      command.type === 'ripple-trim' ||
      (command.type === 'delete-range' && command.ripple !== false)
    ) {
      policyResults.push(
        this.editPolicy?.canRippleTrack?.(
          context as TimelineEditPolicyContext<
            TimelineRippleTrimEditCommand | TimelineDeleteRangeEditCommand
          >
        )
      );
    }
    if (
      command.type === 'insert' ||
      command.type === 'insert-clip-group' ||
      command.type === 'overwrite' ||
      command.type === 'overwrite-clip-group' ||
      command.type === 'delete-range' ||
      command.type === 'lift-range'
    ) {
      for (const placementContext of placementContexts) {
        policyResults.push(
          this.editPolicy?.canEditRange?.(
            placementContext as TimelineEditPolicyContext<
              | TimelineInsertEditCommand
              | TimelineInsertClipGroupEditCommand
              | TimelineOverwriteEditCommand
              | TimelineOverwriteClipGroupEditCommand
              | TimelineDeleteRangeEditCommand
              | TimelineLiftRangeEditCommand
            >
          )
        );
      }
    }

    return policyResults.find((result) => result !== undefined && !result.valid) ?? builtIn;
  }

  private validateBuiltInEditCommand(command: TimelineEditCommand): TimelineEditValidationResult {
    const timing = this.validateEditCommandTiming(command);
    if (!timing.valid) {
      return timing;
    }

    switch (command.type) {
      case 'move':
        return this.validateMoveEditCommand(command);
      case 'trim':
      case 'ripple-trim':
        return this.validateTrimEditCommand(command);
      case 'roll-trim':
        return this.validateRollTrimEditCommand(command);
      case 'slip':
        return this.validateClipEditCommand(command.clipId, 'resizable');
      case 'slide':
        return this.validateClipEditCommand(command.clipId, 'movable');
      case 'split':
        return this.validateSplitEditCommand(command);
      case 'delete-clips':
        return this.validateDeleteClipsEditCommand(command);
      case 'insert':
      case 'overwrite':
        return this.validatePlaceClipCommand(command);
      case 'insert-clip-group':
      case 'overwrite-clip-group':
        return this.validatePlaceClipGroupCommand(command);
      case 'delete-range':
      case 'lift-range':
        return this.validateRangeEditCommand(command);
    }
  }

  private validateEditCommandTiming(command: TimelineEditCommand): TimelineEditValidationResult {
    try {
      switch (command.type) {
        case 'move':
          assertValidRationalTime(command.startTime, 'command.startTime');
          break;
        case 'trim':
        case 'ripple-trim':
          assertValidRationalTime(command.newTime, 'command.newTime');
          break;
        case 'roll-trim':
          assertValidRationalTime(command.boundaryTime, 'command.boundaryTime');
          break;
        case 'slip':
        case 'slide':
          assertValidRationalTime(command.deltaTime, 'command.deltaTime');
          break;
        case 'split':
          assertValidRationalTime(command.time, 'command.time');
          break;
        case 'delete-clips':
          break;
        case 'insert':
        case 'overwrite':
          assertValidRationalTime(command.startTime, 'command.startTime');
          assertValidClipTiming(command.clip, 'command.clip');
          break;
        case 'insert-clip-group':
        case 'overwrite-clip-group':
          for (const [index, placement] of command.placements.entries()) {
            assertValidRationalTime(placement.startTime, `command.placements[${index}].startTime`);
            assertValidClipTiming(placement.clip, `command.placements[${index}].clip`);
          }
          break;
        case 'delete-range':
        case 'lift-range':
          assertValidRationalTime(command.startTime, 'command.startTime');
          assertValidRationalTime(command.endTime, 'command.endTime');
          break;
      }
    } catch (error) {
      return this.rejectEdit(
        'invalid-range',
        error instanceof Error ? error.message : String(error)
      );
    }

    return defaultTimelineEditValidationResult;
  }

  private validateMoveEditCommand(command: TimelineMoveEditCommand): TimelineEditValidationResult {
    const found = this.getClip(command.clipId);
    if (!found) {
      return this.rejectEdit('not-found');
    }
    if (found.track.locked || found.clip.movable === false) {
      return this.rejectEdit('locked');
    }

    const targetTrackId = command.targetTrackId ?? found.track.id;
    const targetTrack = this.state.tracks.find((track) => track.id === targetTrackId);
    if (!targetTrack) {
      return this.rejectEdit('invalid-track');
    }
    if (targetTrack.locked) {
      return this.rejectEdit('locked');
    }
    if (targetTrack.kind !== found.track.kind && command.allowCrossKindTrackMove !== true) {
      return this.rejectEdit('incompatible-track-kind');
    }
    const linkedClipIds = this.getLinkedClipIds(command.clipId);
    if (linkedClipIds.length > 1 && targetTrack.id !== found.track.id) {
      return this.rejectEdit('unsupported');
    }
    for (const linkedClipId of linkedClipIds) {
      const linked = this.getClip(linkedClipId);
      if (!linked) {
        return this.rejectEdit('not-found');
      }
      if (linked.track.locked || linked.clip.movable === false) {
        return this.rejectEdit('locked');
      }
    }
    return defaultTimelineEditValidationResult;
  }

  private validateTrimEditCommand(
    command: TimelineTrimEditCommand | TimelineRippleTrimEditCommand
  ): TimelineEditValidationResult {
    const clipValidation = this.validateClipEditCommand(command.clipId, 'resizable');
    if (!clipValidation.valid) {
      return clipValidation;
    }

    const found = this.getClip(command.clipId);
    if (!found) {
      return this.rejectEdit('not-found');
    }
    const minDuration = fromSeconds(minimumTimelineEditDurationSeconds, command.newTime.r);
    const duration =
      command.edge === 'start'
        ? subRational(found.clip.timelineEnd, command.newTime)
        : subRational(command.newTime, found.clip.timelineStart);
    if (compareRational(duration, minDuration) < 0) {
      return this.rejectEdit('invalid-duration');
    }
    return defaultTimelineEditValidationResult;
  }

  private validateRollTrimEditCommand(
    command: TimelineRollTrimEditCommand
  ): TimelineEditValidationResult {
    const left = this.getClip(command.leftClipId);
    const right = this.getClip(command.rightClipId);
    if (!left || !right) {
      return this.rejectEdit('not-found');
    }
    if (left.track.id !== right.track.id) {
      return this.rejectEdit('invalid-range');
    }
    if (left.track.locked || left.clip.resizable === false || right.clip.resizable === false) {
      return this.rejectEdit('locked');
    }
    const snap = command.snap === false ? null : this.resolveSnap(command.boundaryTime, false);
    return this.validateResolvedRollTrimBoundary(
      command,
      snap?.snappedTime ?? command.boundaryTime
    );
  }

  private validateResolvedRollTrimBoundary(
    command: TimelineRollTrimEditCommand,
    boundaryTime: RationalTime
  ): TimelineEditValidationResult {
    const left = this.getClip(command.leftClipId);
    const right = this.getClip(command.rightClipId);
    if (!left || !right) {
      return this.rejectEdit('not-found');
    }
    const minDuration = fromSeconds(minimumTimelineEditDurationSeconds, boundaryTime.r);
    if (
      compareRational(boundaryTime, addRational(left.clip.timelineStart, minDuration)) < 0 ||
      compareRational(boundaryTime, subRational(right.clip.timelineEnd, minDuration)) > 0
    ) {
      return this.rejectEdit('invalid-duration');
    }
    return defaultTimelineEditValidationResult;
  }

  private validateClipEditCommand(
    clipId: string,
    capability: 'movable' | 'resizable'
  ): TimelineEditValidationResult {
    const found = this.getClip(clipId);
    if (!found) {
      return this.rejectEdit('not-found');
    }
    if (found.track.locked) {
      return this.rejectEdit('locked');
    }
    if (capability === 'movable' && found.clip.movable === false) {
      return this.rejectEdit('locked');
    }
    if (capability === 'resizable' && found.clip.resizable === false) {
      return this.rejectEdit('locked');
    }
    return defaultTimelineEditValidationResult;
  }

  private validateSplitEditCommand(
    command: TimelineSplitEditCommand
  ): TimelineEditValidationResult {
    if (command.clipIds.length === 0) {
      return this.rejectEdit('not-found');
    }
    const requestedClipIds = this.getLinkedCommandClipIds(command.clipIds);
    let hasOverlappingClip = false;
    for (const clipId of requestedClipIds) {
      const found = this.getClip(clipId);
      if (!found) {
        return this.rejectEdit('not-found');
      }
      const overlaps =
        compareRational(command.time, found.clip.timelineStart) > 0 &&
        compareRational(command.time, found.clip.timelineEnd) < 0;
      if (!overlaps) {
        continue;
      }
      if (found.track.locked || found.clip.resizable === false) {
        return this.rejectEdit('locked');
      }
      hasOverlappingClip ||= overlaps;
    }
    return hasOverlappingClip
      ? defaultTimelineEditValidationResult
      : this.rejectEdit('invalid-range');
  }

  private validateDeleteClipsEditCommand(
    command: TimelineDeleteClipsEditCommand
  ): TimelineEditValidationResult {
    if (command.clipIds.length === 0) {
      return this.rejectEdit('not-found');
    }
    const requestedClipIds = this.getLinkedCommandClipIds(command.clipIds);
    for (const clipId of requestedClipIds) {
      const found = this.getClip(clipId);
      if (!found) {
        return this.rejectEdit('not-found');
      }
      if (found.track.locked) {
        return this.rejectEdit('locked');
      }
    }
    return defaultTimelineEditValidationResult;
  }

  private validatePlaceClipCommand(
    command: TimelineInsertEditCommand | TimelineOverwriteEditCommand
  ): TimelineEditValidationResult {
    if (this.getClip(command.clip.id)) {
      return this.rejectEdit('duplicate-id');
    }
    const targetTrack = this.state.tracks.find((track) => track.id === command.targetTrackId);
    if (!targetTrack) {
      return this.rejectEdit('invalid-track');
    }
    if (targetTrack.locked) {
      return this.rejectEdit('locked');
    }
    const duration = subRational(command.clip.timelineEnd, command.clip.timelineStart);
    if (
      compareRational(duration, fromSeconds(minimumTimelineEditDurationSeconds, duration.r)) < 0
    ) {
      return this.rejectEdit('invalid-duration');
    }
    return defaultTimelineEditValidationResult;
  }

  private validatePlaceClipGroupCommand(
    command: TimelineInsertClipGroupEditCommand | TimelineOverwriteClipGroupEditCommand
  ): TimelineEditValidationResult {
    if (command.placements.length < 2) {
      return this.rejectEdit('invalid-range');
    }
    if (command.groupId !== undefined && this.getClipGroup(command.groupId) !== undefined) {
      return this.rejectEdit('duplicate-id');
    }

    const clipIds = new Set<string>();
    const placedByTrack = new Map<string, Clip[]>();
    for (const placement of command.placements) {
      if (clipIds.has(placement.clip.id) || this.getClip(placement.clip.id)) {
        return this.rejectEdit('duplicate-id');
      }
      clipIds.add(placement.clip.id);

      const targetTrack = this.state.tracks.find((track) => track.id === placement.targetTrackId);
      if (!targetTrack) {
        return this.rejectEdit('invalid-track');
      }
      if (targetTrack.locked) {
        return this.rejectEdit('locked');
      }

      const duration = subRational(placement.clip.timelineEnd, placement.clip.timelineStart);
      if (
        compareRational(duration, fromSeconds(minimumTimelineEditDurationSeconds, duration.r)) < 0
      ) {
        return this.rejectEdit('invalid-duration');
      }

      const placedClip = this.createPlacedClipFromGroupPlacement(command, placement);
      const placedClips = placedByTrack.get(placement.targetTrackId) ?? [];
      if (
        placedClips.some(
          (clip) =>
            compareRational(placedClip.timelineStart, clip.timelineEnd) < 0 &&
            compareRational(placedClip.timelineEnd, clip.timelineStart) > 0
        )
      ) {
        return this.rejectEdit('invalid-range');
      }
      placedClips.push(placedClip);
      placedByTrack.set(placement.targetTrackId, placedClips);
    }

    return defaultTimelineEditValidationResult;
  }

  private validateRangeEditCommand(
    command: TimelineDeleteRangeEditCommand | TimelineLiftRangeEditCommand
  ): TimelineEditValidationResult {
    if (compareRational(command.endTime, command.startTime) <= 0) {
      return this.rejectEdit('invalid-range');
    }
    const trackIds = command.trackIds ?? this.state.tracks.map((track) => track.id);
    for (const trackId of trackIds) {
      const track = this.state.tracks.find((candidate) => candidate.id === trackId);
      if (!track) {
        return this.rejectEdit('invalid-track');
      }
      if (track.locked) {
        return this.rejectEdit('locked');
      }
    }
    return defaultTimelineEditValidationResult;
  }

  private rejectEdit(
    reason: TimelineEditRejectionReason,
    message?: string
  ): TimelineEditValidationResult {
    return message === undefined ? { valid: false, reason } : { valid: false, reason, message };
  }

  private createPolicyContext(command: TimelineEditCommand): TimelineEditPolicyContext {
    const sourceClipId = this.getEditCommandSourceClipId(command);
    const found = sourceClipId !== undefined ? this.getClip(sourceClipId) : undefined;
    const targetTrackId =
      command.type === 'move'
        ? (command.targetTrackId ?? found?.track.id)
        : command.type === 'insert' || command.type === 'overwrite'
          ? command.targetTrackId
          : undefined;
    const targetTrack =
      targetTrackId !== undefined
        ? this.state.tracks.find((track) => track.id === targetTrackId)
        : undefined;

    return {
      command,
      state: this.state,
      clip: found?.clip,
      track: found?.track,
      targetTrack,
      range: this.getCommandPolicyRange(command, targetTrackId),
    };
  }

  private createPlacementPolicyContexts(command: TimelineEditCommand): TimelineEditPolicyContext[] {
    if (command.type === 'insert-clip-group' || command.type === 'overwrite-clip-group') {
      return command.placements.map((placement) => {
        const targetTrack = this.state.tracks.find((track) => track.id === placement.targetTrackId);
        return {
          command,
          state: this.state,
          clip: placement.clip,
          targetTrack,
          range: this.getGroupPlacementPolicyRange(command, placement),
        };
      });
    }

    return [this.createPolicyContext(command)];
  }

  private getCommandPolicyRange(
    command: TimelineEditCommand,
    trackId: string | undefined
  ): TimelineEditAffectedRange | undefined {
    if (command.type === 'delete-range' || command.type === 'lift-range') {
      return { startTime: command.startTime, endTime: command.endTime };
    }
    if (command.type === 'insert' || command.type === 'overwrite') {
      const duration = subRational(command.clip.timelineEnd, command.clip.timelineStart);
      return {
        trackId,
        startTime: command.startTime,
        endTime: addRational(command.startTime, duration),
      };
    }
    return undefined;
  }

  private getGroupPlacementPolicyRange(
    command: TimelineInsertClipGroupEditCommand | TimelineOverwriteClipGroupEditCommand,
    placement: TimelineClipGroupPlacement
  ): TimelineEditAffectedRange {
    const placedClip = this.createPlacedClipFromGroupPlacement(command, placement);
    return {
      trackId: placement.targetTrackId,
      startTime: placedClip.timelineStart,
      endTime: placedClip.timelineEnd,
    };
  }

  private resolveMoveEdit(command: TimelineMoveEditCommand): TimelineResolvedEdit {
    const tracks = createTrackSnapshots(this.state.tracks);
    const found = this.getClipInTracks(tracks, command.clipId);
    if (!found) {
      return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('not-found'));
    }

    const targetTrackId = command.targetTrackId ?? found.track.id;
    const targetTrack = tracks.find((track) => track.id === targetTrackId);
    if (!targetTrack) {
      return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('invalid-track'));
    }

    const previousStartTime = cloneRationalTime(found.clip.timelineStart);
    const previousEndTime = cloneRationalTime(found.clip.timelineEnd);
    const duration = subRational(found.clip.timelineEnd, found.clip.timelineStart);
    const snap =
      command.snap === false ? null : this.resolveClipBoundarySnap(command.startTime, duration);
    let startTime = snap?.startTime ?? command.startTime;
    if (found.clip.minStart !== undefined) {
      startTime = maxRational(startTime, found.clip.minStart);
    }
    let endTime = addRational(startTime, duration);
    if (found.clip.maxEnd !== undefined && compareRational(endTime, found.clip.maxEnd) > 0) {
      endTime = found.clip.maxEnd;
      startTime = subRational(endTime, duration);
    }

    const linkedClipIds = this.getLinkedClipIds(command.clipId);
    if (linkedClipIds.length > 1 && targetTrack.id !== found.track.id) {
      return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('unsupported'));
    }

    const deltaTime = subRational(startTime, previousStartTime);
    const changedClips: Clip[] = [];
    for (const linkedClipId of linkedClipIds) {
      const linked = this.getClipInTracks(tracks, linkedClipId);
      if (!linked) {
        return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('not-found'));
      }
      const nextStart = addRational(linked.clip.timelineStart, deltaTime);
      const nextEnd = addRational(linked.clip.timelineEnd, deltaTime);
      if (
        (linked.clip.minStart !== undefined &&
          compareRational(nextStart, linked.clip.minStart) < 0) ||
        (linked.clip.maxEnd !== undefined && compareRational(nextEnd, linked.clip.maxEnd) > 0)
      ) {
        return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('source-bounds'));
      }

      const movedClip = createClipSnapshot(linked.clip, {
        timelineStart: nextStart,
        timelineEnd: nextEnd,
      });
      shiftClipKeyframes(movedClip, deltaTime);
      if (linkedClipId === command.clipId && targetTrack.id !== linked.track.id) {
        linked.track.clips.splice(linked.clipIndex, 1);
        targetTrack.clips.push(movedClip);
      } else {
        linked.track.clips.splice(linked.clipIndex, 1, movedClip);
      }
      changedClips.push(createClipSnapshot(movedClip));
    }

    for (const track of tracks) {
      this.sortTrackClips(track);
    }
    const moved = this.getClipInTracks(tracks, command.clipId);
    if (!moved) {
      return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('not-found'));
    }

    const preview = this.createResolvedEditPreview(command, {
      snap: snap?.result ?? null,
      changedClips,
      createdClips: [],
      removedClips: [],
      affectedRanges: [
        {
          trackId: found.track.id,
          startTime: previousStartTime,
          endTime: previousEndTime,
        },
        { trackId: targetTrack.id, startTime, endTime },
      ],
      impacts: [],
    });
    const moveResult: TimelineClipMoveResult = {
      clipId: command.clipId,
      clip: moved.clip,
      sourceTrackId: found.track.id,
      destinationTrackId: moved.track.id,
      sourceTrackIndex: found.trackIndex,
      destinationTrackIndex: moved.trackIndex,
      sourceClipIndex: found.clipIndex,
      destinationClipIndex: moved.clipIndex,
      previousStartTime,
      previousEndTime,
      startTime: cloneRationalTime(moved.clip.timelineStart),
      endTime: cloneRationalTime(moved.clip.timelineEnd),
      changedClips,
    };

    return this.createResolvedEdit(command, tracks, preview, { moveResult });
  }

  private resolveTrimEdit(
    command: TimelineTrimEditCommand | TimelineRippleTrimEditCommand,
    ripple: boolean
  ): TimelineResolvedEdit {
    const tracks = createTrackSnapshots(this.state.tracks);
    const found = this.getClipInTracks(tracks, command.clipId);
    if (!found) {
      return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('not-found'));
    }

    const originalClip = createClipSnapshot(found.clip);
    const snap = command.snap === false ? null : this.resolveSnap(command.newTime, false);
    const targetTime = snap?.snappedTime ?? command.newTime;
    const minDuration = fromSeconds(minimumTimelineEditDurationSeconds, targetTime.r);
    const oldStart = found.clip.timelineStart;
    const oldEnd = found.clip.timelineEnd;

    if (command.edge === 'start') {
      const maxStart = subRational(found.clip.timelineEnd, minDuration);
      let startTime = minRational(maxRational(targetTime, fromSeconds(0, targetTime.r)), maxStart);
      if (found.clip.minStart !== undefined) {
        startTime = maxRational(startTime, found.clip.minStart);
      }
      found.clip.timelineStart = startTime;
      found.clip.sourceStart = addRational(
        found.clip.sourceStart,
        subRational(startTime, oldStart)
      );
    } else {
      let endTime = maxRational(targetTime, addRational(found.clip.timelineStart, minDuration));
      if (found.clip.maxEnd !== undefined) {
        endTime = minRational(endTime, found.clip.maxEnd);
      }
      found.clip.timelineEnd = endTime;
    }

    const delta =
      command.edge === 'start'
        ? subRational(found.clip.timelineStart, oldStart)
        : subRational(found.clip.timelineEnd, oldEnd);
    const changedClips = [createClipSnapshot(found.clip)];
    if (ripple && toSeconds(delta) !== 0) {
      for (const clip of found.track.clips) {
        if (clip.id === found.clip.id || compareRational(clip.timelineStart, oldEnd) < 0) {
          continue;
        }
        clip.timelineStart = addRational(clip.timelineStart, delta);
        clip.timelineEnd = addRational(clip.timelineEnd, delta);
        shiftClipKeyframes(clip, delta);
        changedClips.push(createClipSnapshot(clip));
      }
      this.sortTrackClips(found.track);
    }

    return this.createResolvedEdit(
      command,
      tracks,
      this.createResolvedEditPreview(command, {
        snap,
        changedClips,
        createdClips: [],
        removedClips: [],
        affectedRanges: [{ trackId: found.track.id, startTime: oldStart, endTime: oldEnd }],
        impacts: [
          {
            clipId: found.clip.id,
            trackId: found.track.id,
            originalClip,
            resultClips: [createClipSnapshot(found.clip)],
            effect: command.edge === 'start' ? 'trim-start' : 'trim-end',
            affectedStartTime: minRational(oldStart, found.clip.timelineStart),
            affectedEndTime: maxRational(oldEnd, found.clip.timelineEnd),
            cutStart: command.edge === 'start',
            cutEnd: command.edge === 'end',
          },
        ],
      })
    );
  }

  private resolveRollTrimEdit(command: TimelineRollTrimEditCommand): TimelineResolvedEdit {
    const tracks = createTrackSnapshots(this.state.tracks);
    const left = this.getClipInTracks(tracks, command.leftClipId);
    const right = this.getClipInTracks(tracks, command.rightClipId);
    if (!left || !right || left.track.id !== right.track.id) {
      return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('invalid-range'));
    }

    const snap = command.snap === false ? null : this.resolveSnap(command.boundaryTime, false);
    const boundaryTime = snap?.snappedTime ?? command.boundaryTime;
    const boundaryValidation = this.validateResolvedRollTrimBoundary(command, boundaryTime);
    if (!boundaryValidation.valid) {
      return this.createRejectedResolvedEdit(command, tracks, boundaryValidation);
    }
    const originalLeft = createClipSnapshot(left.clip);
    const originalRight = createClipSnapshot(right.clip);
    left.clip.timelineEnd = boundaryTime;
    right.clip.sourceStart = addRational(
      right.clip.sourceStart,
      subRational(boundaryTime, right.clip.timelineStart)
    );
    right.clip.timelineStart = boundaryTime;
    this.sortTrackClips(left.track);

    return this.createResolvedEdit(
      command,
      tracks,
      this.createResolvedEditPreview(command, {
        snap,
        changedClips: [createClipSnapshot(left.clip), createClipSnapshot(right.clip)],
        createdClips: [],
        removedClips: [],
        affectedRanges: [
          {
            trackId: left.track.id,
            startTime: originalLeft.timelineStart,
            endTime: originalRight.timelineEnd,
          },
        ],
        impacts: [
          {
            clipId: left.clip.id,
            trackId: left.track.id,
            originalClip: originalLeft,
            resultClips: [createClipSnapshot(left.clip)],
            effect: 'trim-end',
            affectedStartTime: minRational(originalLeft.timelineEnd, boundaryTime),
            affectedEndTime: maxRational(originalLeft.timelineEnd, boundaryTime),
            cutEnd: true,
          },
          {
            clipId: right.clip.id,
            trackId: right.track.id,
            originalClip: originalRight,
            resultClips: [createClipSnapshot(right.clip)],
            effect: 'trim-start',
            affectedStartTime: minRational(originalRight.timelineStart, boundaryTime),
            affectedEndTime: maxRational(originalRight.timelineStart, boundaryTime),
            cutStart: true,
          },
        ],
      })
    );
  }

  private resolveSlipEdit(command: TimelineSlipEditCommand): TimelineResolvedEdit {
    const tracks = createTrackSnapshots(this.state.tracks);
    const found = this.getClipInTracks(tracks, command.clipId);
    if (!found) {
      return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('not-found'));
    }

    const originalClip = createClipSnapshot(found.clip);
    found.clip.sourceStart = maxRational(
      addRational(found.clip.sourceStart, command.deltaTime),
      fromSeconds(0, command.deltaTime.r)
    );

    return this.createResolvedEdit(
      command,
      tracks,
      this.createResolvedEditPreview(command, {
        snap: null,
        changedClips: [createClipSnapshot(found.clip)],
        createdClips: [],
        removedClips: [],
        affectedRanges: [
          {
            trackId: found.track.id,
            startTime: found.clip.timelineStart,
            endTime: found.clip.timelineEnd,
          },
        ],
        impacts: [
          {
            clipId: found.clip.id,
            trackId: found.track.id,
            originalClip,
            resultClips: [createClipSnapshot(found.clip)],
            effect: 'trim-start',
            affectedStartTime: found.clip.timelineStart,
            affectedEndTime: found.clip.timelineEnd,
          },
        ],
      })
    );
  }

  private resolveSlideEdit(command: TimelineSlideEditCommand): TimelineResolvedEdit {
    const found = this.getClip(command.clipId);
    if (!found) {
      return this.createRejectedResolvedEdit(
        command,
        createTrackSnapshots(this.state.tracks),
        this.rejectEdit('not-found')
      );
    }
    const resolved = this.resolveMoveEdit({
      type: 'move',
      clipId: command.clipId,
      startTime: addRational(found.clip.timelineStart, command.deltaTime),
      snap: command.snap,
    });
    return this.createResolvedEdit(
      command,
      resolved.tracks,
      {
        ...resolved.preview,
        command,
      },
      {
        moveResult: resolved.moveResult,
        createdClipEvents: resolved.createdClipEvents,
        removedClipEvents: resolved.removedClipEvents,
      }
    );
  }

  private resolveSplitEdit(command: TimelineSplitEditCommand): TimelineResolvedEdit {
    const tracks = createTrackSnapshots(this.state.tracks);
    const requestedClipIds = new Set(this.getLinkedCommandClipIds(command.clipIds));

    const changedClips: Clip[] = [];
    const createdClips: Clip[] = [];
    const createdClipEvents: TimelineCreatedClipEvent[] = [];
    const impacts: TimelineEditImpact[] = [];
    const splitRightClipIds = new Map<string, string>();

    for (const track of tracks) {
      const nextClips: Clip[] = [];
      for (const clip of track.clips) {
        const shouldSplit =
          requestedClipIds.has(clip.id) &&
          compareRational(command.time, clip.timelineStart) > 0 &&
          compareRational(command.time, clip.timelineEnd) < 0;
        if (!shouldSplit) {
          nextClips.push(clip);
          continue;
        }

        const originalClip = createClipSnapshot(clip);
        const leftClip = createClipSnapshot(clip, { timelineEnd: command.time });
        const rightClip = createClipSnapshot(clip, {
          id: crypto.randomUUID(),
          timelineStart: command.time,
          sourceStart: addRational(clip.sourceStart, subRational(command.time, clip.timelineStart)),
          selected: false,
        });
        filterClipKeyframesToClipRange(leftClip);
        filterClipKeyframesToClipRange(rightClip);
        nextClips.push(leftClip, rightClip);
        splitRightClipIds.set(clip.id, rightClip.id);
        changedClips.push(createClipSnapshot(leftClip), createClipSnapshot(rightClip));
        createdClips.push(createClipSnapshot(rightClip));
        createdClipEvents.push({
          clip: createClipSnapshot(rightClip),
          reason: 'split',
          originClipId: clip.id,
        });
        impacts.push({
          clipId: clip.id,
          trackId: track.id,
          originalClip,
          resultClips: [createClipSnapshot(leftClip), createClipSnapshot(rightClip)],
          effect: 'split',
          affectedStartTime: command.time,
          affectedEndTime: command.time,
          cutStart: true,
          cutEnd: true,
        });
      }
      track.clips = nextClips;
      this.sortTrackClips(track);
    }

    if (splitRightClipIds.size === 0) {
      return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('invalid-range'));
    }

    const nextClipGroups = this.repartitionClipGroupsAfterSplit(
      tracks,
      command.time,
      splitRightClipIds
    );

    return this.createResolvedEdit(
      command,
      tracks,
      this.createResolvedEditPreview(command, {
        snap: null,
        changedClips,
        createdClips,
        removedClips: [],
        affectedRanges: [{ startTime: command.time, endTime: command.time }],
        impacts,
      }),
      { clipGroups: nextClipGroups, createdClipEvents }
    );
  }

  private resolveDeleteClipsEdit(command: TimelineDeleteClipsEditCommand): TimelineResolvedEdit {
    const tracks = createTrackSnapshots(this.state.tracks);
    const requestedClipIds = new Set(this.getLinkedCommandClipIds(command.clipIds));
    const removedClips: Clip[] = [];
    const removedClipEvents: TimelineRemovedClipEvent[] = [];
    const affectedRanges: TimelineEditAffectedRange[] = [];
    const impacts: TimelineEditImpact[] = [];

    for (const track of tracks) {
      const nextClips: Clip[] = [];
      for (const clip of track.clips) {
        if (!requestedClipIds.has(clip.id)) {
          nextClips.push(clip);
          continue;
        }

        const originalClip = createClipSnapshot(clip);
        removedClips.push(originalClip);
        removedClipEvents.push({ clip: originalClip, reason: 'delete' });
        affectedRanges.push({
          trackId: track.id,
          startTime: clip.timelineStart,
          endTime: clip.timelineEnd,
        });
        impacts.push({
          clipId: clip.id,
          trackId: track.id,
          originalClip,
          resultClips: [],
          effect: 'remove',
          affectedStartTime: clip.timelineStart,
          affectedEndTime: clip.timelineEnd,
          cutStart: true,
          cutEnd: true,
        });
      }
      track.clips = nextClips;
    }

    if (removedClips.length === 0) {
      return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('not-found'));
    }

    return this.createResolvedEdit(
      command,
      tracks,
      this.createResolvedEditPreview(command, {
        snap: null,
        changedClips: [],
        createdClips: [],
        removedClips,
        affectedRanges,
        impacts,
      }),
      {
        clipGroups: this.normalizeClipGroupsForTracks(this.state.clipGroups, tracks),
        removedClipEvents,
      }
    );
  }

  private resolveInsertEdit(command: TimelineInsertEditCommand): TimelineResolvedEdit {
    const tracks = createTrackSnapshots(this.state.tracks);
    const targetTrack = tracks.find((track) => track.id === command.targetTrackId);
    if (!targetTrack) {
      return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('invalid-track'));
    }

    const placedClip = this.createPlacedClip(command);
    const duration = subRational(placedClip.timelineEnd, placedClip.timelineStart);
    for (const clip of targetTrack.clips) {
      if (compareRational(clip.timelineStart, placedClip.timelineStart) >= 0) {
        clip.timelineStart = addRational(clip.timelineStart, duration);
        clip.timelineEnd = addRational(clip.timelineEnd, duration);
        shiftClipKeyframes(clip, duration);
      }
    }
    targetTrack.clips.push(placedClip);
    this.sortTrackClips(targetTrack);

    const placedClipEvent = {
      clip: createClipSnapshot(placedClip),
      reason: 'insert',
    } satisfies TimelineCreatedClipEvent;

    return this.createResolvedEdit(
      command,
      tracks,
      this.createResolvedEditPreview(command, {
        snap: command.snap === false ? null : this.resolveSnap(command.startTime, false),
        changedClips: targetTrack.clips
          .filter(
            (clip) =>
              clip.id !== placedClip.id &&
              compareRational(clip.timelineStart, placedClip.timelineEnd) >= 0
          )
          .map((clip) => createClipSnapshot(clip)),
        createdClips: [createClipSnapshot(placedClip)],
        removedClips: [],
        affectedRanges: [
          {
            trackId: targetTrack.id,
            startTime: placedClip.timelineStart,
            endTime: placedClip.timelineEnd,
          },
        ],
        impacts: [],
      }),
      { createdClipEvents: [placedClipEvent] }
    );
  }

  private resolveOverwriteEdit(command: TimelineOverwriteEditCommand): TimelineResolvedEdit {
    const tracks = createTrackSnapshots(this.state.tracks);
    const targetTrack = tracks.find((track) => track.id === command.targetTrackId);
    if (!targetTrack) {
      return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('invalid-track'));
    }

    const placedClip = this.createPlacedClip(command);
    targetTrack.clips.push(placedClip);
    const overwriteResult = this.resolveTrackOverwrite(targetTrack, placedClip);

    const placedClipEvent = {
      clip: createClipSnapshot(placedClip),
      reason: 'overwrite',
    } satisfies TimelineCreatedClipEvent;

    return this.createResolvedEdit(
      command,
      tracks,
      this.createResolvedEditPreview(command, {
        snap: command.snap === false ? null : this.resolveSnap(command.startTime, false),
        changedClips: overwriteResult.changedClips,
        createdClips: [createClipSnapshot(placedClip), ...overwriteResult.createdClips],
        removedClips: overwriteResult.removedClips,
        affectedRanges: [
          {
            trackId: targetTrack.id,
            startTime: placedClip.timelineStart,
            endTime: placedClip.timelineEnd,
          },
        ],
        impacts: overwriteResult.impacts,
      }),
      {
        createdClipEvents: [placedClipEvent, ...overwriteResult.createdClipEvents],
        removedClipEvents: overwriteResult.removedClips.map((clip) => ({
          clip,
          reason: 'overwrite',
        })),
      }
    );
  }

  private resolveInsertClipGroupEdit(
    command: TimelineInsertClipGroupEditCommand
  ): TimelineResolvedEdit {
    const tracks = createTrackSnapshots(this.state.tracks);
    const resolvedPlacements = this.resolveClipGroupPlacements(command, tracks);
    if ('validation' in resolvedPlacements) {
      return this.createRejectedResolvedEdit(command, tracks, resolvedPlacements.validation);
    }

    const changedClips: Clip[] = [];
    const createdClips = resolvedPlacements.placements.map((placement) =>
      createClipSnapshot(placement.clip)
    );
    const affectedRanges = resolvedPlacements.placements.map((placement) => ({
      trackId: placement.track.id,
      startTime: placement.clip.timelineStart,
      endTime: placement.clip.timelineEnd,
    }));
    const placementsByTrack = new Map<
      string,
      { clip: Clip; duration: RationalTime; track: Track }[]
    >();

    for (const placement of resolvedPlacements.placements) {
      const duration = subRational(placement.clip.timelineEnd, placement.clip.timelineStart);
      const trackPlacements = placementsByTrack.get(placement.track.id) ?? [];
      trackPlacements.push({ clip: placement.clip, duration, track: placement.track });
      placementsByTrack.set(placement.track.id, trackPlacements);
    }

    for (const [, trackPlacements] of placementsByTrack) {
      const track = trackPlacements[0]?.track;
      if (track === undefined) {
        continue;
      }
      for (const clip of track.clips) {
        const originalStart = cloneRationalTime(clip.timelineStart);
        let delta = fromSeconds(0, originalStart.r);
        for (const placement of trackPlacements) {
          if (compareRational(originalStart, placement.clip.timelineStart) >= 0) {
            delta = addRational(delta, placement.duration);
          }
        }
        if (toSeconds(delta) === 0) {
          continue;
        }
        clip.timelineStart = addRational(clip.timelineStart, delta);
        clip.timelineEnd = addRational(clip.timelineEnd, delta);
        shiftClipKeyframes(clip, delta);
        changedClips.push(createClipSnapshot(clip));
      }
    }

    for (const placement of resolvedPlacements.placements) {
      placement.track.clips.push(placement.clip);
      this.sortTrackClips(placement.track);
    }

    return this.createResolvedEdit(
      command,
      tracks,
      this.createResolvedEditPreview(command, {
        snap: resolvedPlacements.firstSnap,
        changedClips,
        createdClips,
        removedClips: [],
        affectedRanges,
        impacts: [],
      }),
      {
        clipGroups: this.createClipGroupsAfterGroupedPlacement(command),
        createdClipEvents: createdClips.map((clip) => ({
          clip,
          reason: 'insert',
        })),
      }
    );
  }

  private resolveOverwriteClipGroupEdit(
    command: TimelineOverwriteClipGroupEditCommand
  ): TimelineResolvedEdit {
    const tracks = createTrackSnapshots(this.state.tracks);
    const resolvedPlacements = this.resolveClipGroupPlacements(command, tracks);
    if ('validation' in resolvedPlacements) {
      return this.createRejectedResolvedEdit(command, tracks, resolvedPlacements.validation);
    }

    const changedClips: Clip[] = [];
    const placedClips = resolvedPlacements.placements.map((placement) =>
      createClipSnapshot(placement.clip)
    );
    const createdClips: Clip[] = [...placedClips];
    const removedClips: Clip[] = [];
    const impacts: TimelineEditImpact[] = [];
    const createdClipEvents: TimelineCreatedClipEvent[] = placedClips.map((clip) => ({
      clip,
      reason: 'overwrite',
    }));
    const removedClipEvents: TimelineRemovedClipEvent[] = [];
    const affectedRanges = resolvedPlacements.placements.map((placement) => ({
      trackId: placement.track.id,
      startTime: placement.clip.timelineStart,
      endTime: placement.clip.timelineEnd,
    }));

    for (const placement of resolvedPlacements.placements) {
      placement.track.clips.push(placement.clip);
    }

    for (const placement of resolvedPlacements.placements) {
      const overwriteResult = this.resolveTrackOverwrite(placement.track, placement.clip);
      changedClips.push(...overwriteResult.changedClips);
      createdClips.push(...overwriteResult.createdClips);
      removedClips.push(...overwriteResult.removedClips);
      impacts.push(...overwriteResult.impacts);
      createdClipEvents.push(...overwriteResult.createdClipEvents);
      removedClipEvents.push(
        ...overwriteResult.removedClips.map((clip) => ({
          clip,
          reason: 'overwrite' as const,
        }))
      );
    }

    return this.createResolvedEdit(
      command,
      tracks,
      this.createResolvedEditPreview(command, {
        snap: resolvedPlacements.firstSnap,
        changedClips,
        createdClips,
        removedClips,
        affectedRanges,
        impacts,
      }),
      {
        clipGroups: this.createClipGroupsAfterGroupedPlacement(command),
        createdClipEvents,
        removedClipEvents,
      }
    );
  }

  private resolveClipGroupPlacements(
    command: TimelineInsertClipGroupEditCommand | TimelineOverwriteClipGroupEditCommand,
    tracks: Track[]
  ): TimelineResolvedClipGroupPlacements | TimelineRejectedClipGroupPlacements {
    const placements: TimelineResolvedClipGroupPlacement[] = [];
    const snap = this.resolveClipGroupPlacementSnap(command);

    for (const placement of command.placements) {
      const track = tracks.find((candidate) => candidate.id === placement.targetTrackId);
      if (track === undefined) {
        return { validation: this.rejectEdit('invalid-track') };
      }
      const resolvedPlacement = this.resolveGroupPlacement(placement, snap.deltaTime);
      placements.push({
        clip: resolvedPlacement.clip,
        track,
      });
    }

    return { placements, firstSnap: snap.result };
  }

  private createClipGroupsAfterGroupedPlacement(
    command: TimelineInsertClipGroupEditCommand | TimelineOverwriteClipGroupEditCommand
  ): TimelineClipGroup[] {
    return createClipGroupSnapshots([
      ...this.state.clipGroups,
      {
        id: command.groupId ?? crypto.randomUUID(),
        clipIds: command.placements.map((placement) => placement.clip.id),
        ...(command.label !== undefined ? { label: command.label } : {}),
      },
    ]);
  }

  private resolveRangeRemovalEdit(
    command: TimelineDeleteRangeEditCommand | TimelineLiftRangeEditCommand,
    ripple: boolean
  ): TimelineResolvedEdit {
    const tracks = createTrackSnapshots(this.state.tracks);
    const selectedTrackIds = new Set(command.trackIds ?? tracks.map((track) => track.id));
    const removedClips: Clip[] = [];
    const changedClips: Clip[] = [];
    const createdClips: Clip[] = [];
    const createdClipEvents: TimelineCreatedClipEvent[] = [];
    const removedClipEvents: TimelineRemovedClipEvent[] = [];
    const impacts: TimelineEditImpact[] = [];
    const duration = subRational(command.endTime, command.startTime);

    for (const track of tracks) {
      if (!selectedTrackIds.has(track.id)) {
        continue;
      }

      const nextClips: Clip[] = [];
      for (const clip of track.clips) {
        const overlaps =
          compareRational(command.startTime, clip.timelineEnd) < 0 &&
          compareRational(command.endTime, clip.timelineStart) > 0;
        if (!overlaps) {
          const shouldRipple = ripple && compareRational(clip.timelineStart, command.endTime) >= 0;
          if (shouldRipple) {
            clip.timelineStart = subRational(clip.timelineStart, duration);
            clip.timelineEnd = subRational(clip.timelineEnd, duration);
            shiftClipKeyframes(clip, subRational(fromSeconds(0, duration.r), duration));
            changedClips.push(createClipSnapshot(clip));
          }
          nextClips.push(clip);
          continue;
        }

        const originalClip = createClipSnapshot(clip);
        const resultClips: Clip[] = [];
        if (
          compareRational(command.startTime, clip.timelineStart) <= 0 &&
          compareRational(command.endTime, clip.timelineEnd) >= 0
        ) {
          removedClips.push(originalClip);
          removedClipEvents.push({
            clip: originalClip,
            reason: command.type === 'lift-range' ? 'lift-range' : 'delete-range',
          });
        } else if (
          compareRational(command.startTime, clip.timelineStart) > 0 &&
          compareRational(command.endTime, clip.timelineEnd) < 0
        ) {
          const leftClip = createClipSnapshot(clip, { timelineEnd: command.startTime });
          const rightClip = createClipSnapshot(clip, {
            id: crypto.randomUUID(),
            timelineStart: ripple ? command.startTime : command.endTime,
            timelineEnd: ripple ? subRational(clip.timelineEnd, duration) : clip.timelineEnd,
            sourceStart: addRational(
              clip.sourceStart,
              subRational(command.endTime, clip.timelineStart)
            ),
            selected: false,
          });
          if (ripple) {
            shiftClipKeyframes(rightClip, subRational(fromSeconds(0, duration.r), duration));
          }
          filterClipKeyframesToClipRange(leftClip);
          filterClipKeyframesToClipRange(rightClip);
          resultClips.push(leftClip, rightClip);
          createdClips.push(createClipSnapshot(rightClip));
          createdClipEvents.push({
            clip: createClipSnapshot(rightClip),
            reason: 'range-split',
            originClipId: clip.id,
          });
          changedClips.push(createClipSnapshot(leftClip), createClipSnapshot(rightClip));
        } else if (compareRational(command.startTime, clip.timelineStart) <= 0) {
          const nextStart = ripple ? command.startTime : command.endTime;
          const changedClip = createClipSnapshot(clip, {
            timelineStart: nextStart,
            timelineEnd: ripple ? subRational(clip.timelineEnd, duration) : clip.timelineEnd,
            sourceStart: addRational(
              clip.sourceStart,
              subRational(command.endTime, clip.timelineStart)
            ),
          });
          if (ripple) {
            shiftClipKeyframes(changedClip, subRational(fromSeconds(0, duration.r), duration));
          }
          filterClipKeyframesToClipRange(changedClip);
          resultClips.push(changedClip);
          changedClips.push(createClipSnapshot(changedClip));
        } else {
          const changedClip = createClipSnapshot(clip, { timelineEnd: command.startTime });
          filterClipKeyframesToClipRange(changedClip);
          resultClips.push(changedClip);
          changedClips.push(createClipSnapshot(changedClip));
        }

        nextClips.push(...resultClips);
        impacts.push({
          clipId: clip.id,
          trackId: track.id,
          originalClip,
          resultClips: resultClips.map((resultClip) => createClipSnapshot(resultClip)),
          effect:
            resultClips.length === 0
              ? 'remove'
              : resultClips.length > 1
                ? 'split'
                : compareRational(command.startTime, clip.timelineStart) <= 0
                  ? 'trim-start'
                  : 'trim-end',
          affectedStartTime: maxRational(command.startTime, clip.timelineStart),
          affectedEndTime: minRational(command.endTime, clip.timelineEnd),
          cutStart: compareRational(command.startTime, clip.timelineStart) <= 0,
          cutEnd: compareRational(command.endTime, clip.timelineEnd) >= 0,
        });
      }
      track.clips = nextClips;
      this.sortTrackClips(track);
    }

    return this.createResolvedEdit(
      command,
      tracks,
      this.createResolvedEditPreview(command, {
        snap: null,
        changedClips,
        createdClips,
        removedClips,
        affectedRanges: [{ startTime: command.startTime, endTime: command.endTime }],
        impacts,
      }),
      { createdClipEvents, removedClipEvents }
    );
  }

  private createValidatedClipGroup(
    options: TimelineCreateClipGroupOptions
  ): TimelineClipGroup | null {
    if (options.clipIds.length < 2) {
      return null;
    }
    const uniqueClipIds = new Set(options.clipIds);
    if (uniqueClipIds.size !== options.clipIds.length) {
      return null;
    }
    if (options.id !== undefined && this.getClipGroup(options.id) !== undefined) {
      return null;
    }

    for (const clipId of options.clipIds) {
      if (this.getClip(clipId) === undefined || this.getClipGroupForClip(clipId) !== undefined) {
        return null;
      }
    }

    return createClipGroupSnapshots([
      {
        id: options.id ?? crypto.randomUUID(),
        clipIds: [...options.clipIds],
        ...(options.label !== undefined ? { label: options.label } : {}),
      },
    ])[0];
  }

  private normalizeClipGroupsForTracks(
    clipGroups: readonly TimelineClipGroup[],
    tracks: readonly Track[]
  ): TimelineClipGroup[] {
    const existingClipIds = new Set<string>();
    for (const track of tracks) {
      for (const clip of track.clips) {
        existingClipIds.add(clip.id);
      }
    }

    const claimedClipIds = new Set<string>();
    const nextGroups: TimelineClipGroup[] = [];
    for (const group of clipGroups) {
      const clipIds = group.clipIds.filter((clipId) => {
        if (!existingClipIds.has(clipId) || claimedClipIds.has(clipId)) {
          return false;
        }
        claimedClipIds.add(clipId);
        return true;
      });
      if (clipIds.length >= 2) {
        nextGroups.push({
          id: group.id,
          clipIds,
          ...(group.label !== undefined ? { label: group.label } : {}),
        });
      }
    }
    return nextGroups;
  }

  private normalizeClipGroups() {
    this.state.clipGroups = this.normalizeClipGroupsForTracks(
      this.state.clipGroups,
      this.state.tracks
    );
  }

  private getLinkedClipIds(clipId: string): string[] {
    return this.getClipGroupForClip(clipId)?.clipIds ?? [clipId];
  }

  private getLinkedCommandClipIds(clipIds: readonly string[]) {
    const linkedClipIds = new Set<string>();
    for (const clipId of clipIds) {
      for (const linkedClipId of this.getLinkedClipIds(clipId)) {
        linkedClipIds.add(linkedClipId);
      }
    }
    return [...linkedClipIds];
  }

  private getSelectedClipIds() {
    const clipIds: string[] = [];
    for (const track of this.state.tracks) {
      for (const clip of track.clips) {
        if (clip.selected) {
          clipIds.push(clip.id);
        }
      }
    }
    return clipIds;
  }

  private repartitionClipGroupsAfterSplit(
    tracks: Track[],
    splitTime: RationalTime,
    splitRightClipIds: ReadonlyMap<string, string>
  ): TimelineClipGroup[] {
    const clipById = new Map<string, Clip>();
    for (const track of tracks) {
      for (const clip of track.clips) {
        clipById.set(clip.id, clip);
      }
    }

    const nextGroups: TimelineClipGroup[] = [];
    for (const group of this.state.clipGroups) {
      const groupWasSplit = group.clipIds.some((clipId) => splitRightClipIds.has(clipId));
      if (!groupWasSplit) {
        nextGroups.push({
          id: group.id,
          clipIds: [...group.clipIds],
          ...(group.label !== undefined ? { label: group.label } : {}),
        });
        continue;
      }

      const leftClipIds: string[] = [];
      const rightClipIds: string[] = [];
      for (const clipId of group.clipIds) {
        const rightClipId = splitRightClipIds.get(clipId);
        if (rightClipId !== undefined) {
          leftClipIds.push(clipId);
          rightClipIds.push(rightClipId);
          continue;
        }

        const clip = clipById.get(clipId);
        if (clip === undefined) {
          continue;
        }
        if (compareRational(clip.timelineEnd, splitTime) <= 0) {
          leftClipIds.push(clip.id);
        } else if (compareRational(clip.timelineStart, splitTime) >= 0) {
          rightClipIds.push(clip.id);
        }
      }

      if (leftClipIds.length >= 2) {
        nextGroups.push({
          id: group.id,
          clipIds: leftClipIds,
          ...(group.label !== undefined ? { label: group.label } : {}),
        });
      }
      if (rightClipIds.length >= 2) {
        nextGroups.push({
          id: crypto.randomUUID(),
          clipIds: rightClipIds,
          ...(group.label !== undefined ? { label: group.label } : {}),
        });
      }
    }

    return createClipGroupSnapshots(nextGroups);
  }

  /**
   * Returns a clip group by id.
   *
   * @param groupId - Clip group id to inspect.
   * @returns The matching group, or undefined when missing.
   */
  getClipGroup(groupId: string): TimelineClipGroup | undefined {
    return this.state.clipGroups.find((group) => group.id === groupId);
  }

  /**
   * Returns the group containing a clip.
   *
   * @param clipId - Clip id to inspect.
   * @returns The containing group, or undefined when the clip is ungrouped.
   */
  getClipGroupForClip(clipId: string): TimelineClipGroup | undefined {
    return this.state.clipGroups.find((group) => group.clipIds.includes(clipId));
  }

  /**
   * Returns clips contained by a group in group order.
   *
   * @param groupId - Clip group id to inspect.
   * @returns Group clip entries, or an empty array when the group is missing.
   */
  getClipGroupClips(groupId: string) {
    const group = this.getClipGroup(groupId);
    if (group === undefined) {
      return [];
    }

    return group.clipIds.flatMap((clipId) => {
      const found = this.getClip(clipId);
      return found === undefined ? [] : [found];
    });
  }

  /**
   * Creates a clip group from existing clips.
   *
   * @param options - Existing clip ids and optional group metadata.
   * @returns The created group, or null when validation fails.
   */
  createClipGroup(options: TimelineCreateClipGroupOptions): TimelineClipGroup | null {
    const group = this.createValidatedClipGroup(options);
    if (group === null) {
      return null;
    }

    this.state.clipGroups.push(group);
    this.selectClips(group.clipIds);
    this.snapshot();
    this.emit('state:settled');
    this.emit('render');
    return group;
  }

  /**
   * Removes one clip group.
   *
   * @param groupId - Clip group id to remove.
   * @returns Whether a group was removed.
   */
  ungroupClipGroup(groupId: string) {
    const groupIndex = this.state.clipGroups.findIndex((group) => group.id === groupId);
    if (groupIndex === -1) {
      return false;
    }

    this.state.clipGroups.splice(groupIndex, 1);
    this.snapshot();
    this.emit('state:settled');
    this.emit('render');
    return true;
  }

  /**
   * Removes groups containing any of the supplied clips.
   *
   * @param clipIds - Clip ids whose groups should be removed.
   * @returns Whether any groups were removed.
   */
  ungroupClips(clipIds: readonly string[]) {
    const clipIdSet = new Set(clipIds);
    const previousLength = this.state.clipGroups.length;
    this.state.clipGroups = this.state.clipGroups.filter(
      (group) => !group.clipIds.some((clipId) => clipIdSet.has(clipId))
    );
    if (this.state.clipGroups.length === previousLength) {
      return false;
    }

    this.snapshot();
    this.emit('state:settled');
    this.emit('render');
    return true;
  }

  /**
   * Inserts multiple clips on chosen tracks and groups them in one history entry.
   *
   * @param options - Placements and optional group metadata.
   * @returns The created group, or null when validation fails.
   */
  insertClipGroup(options: TimelineInsertClipGroupOptions): TimelineClipGroup | null {
    if (options.placements.length < 2) {
      return null;
    }
    if (options.groupId !== undefined && this.getClipGroup(options.groupId) !== undefined) {
      return null;
    }
    const insertedClipIds = new Set<string>();
    for (const placement of options.placements) {
      if (insertedClipIds.has(placement.clip.id) || this.getClip(placement.clip.id)) {
        return null;
      }
      const targetTrack = this.state.tracks.find((track) => track.id === placement.targetTrackId);
      if (targetTrack === undefined || targetTrack.locked) {
        return null;
      }
      insertedClipIds.add(placement.clip.id);
    }

    const group = createClipGroupSnapshots([
      {
        id: options.groupId ?? crypto.randomUUID(),
        clipIds: [...insertedClipIds],
        ...(options.label !== undefined ? { label: options.label } : {}),
      },
    ])[0];
    const tracks = createTrackSnapshots(this.state.tracks);
    const createdClips: Clip[] = [];
    try {
      for (const placement of options.placements) {
        const targetTrack = tracks.find((track) => track.id === placement.targetTrackId);
        if (targetTrack === undefined) {
          return null;
        }
        const duration = subRational(placement.clip.timelineEnd, placement.clip.timelineStart);
        const clip = createClipSnapshot(placement.clip, {
          timelineStart: placement.startTime,
          timelineEnd: addRational(placement.startTime, duration),
        });
        shiftClipKeyframes(clip, subRational(clip.timelineStart, placement.clip.timelineStart));
        targetTrack.clips.push(clip);
        this.sortTrackClips(targetTrack);
        createdClips.push(createClipSnapshot(clip));
      }
    } catch {
      return null;
    }

    this.state.tracks = tracks;
    this.state.clipGroups.push(group);
    this.selectClips(group.clipIds);
    this.invalidateContent();
    for (const clip of createdClips) {
      this.emit('clip:created', { clip, reason: 'insert' } satisfies ClipCreatedEvent);
    }
    this.snapshot();
    this.emit('state:settled');
    this.emit('render');
    return group;
  }

  private createPlacedClip(command: TimelinePlaceClipCommand): Clip {
    const duration = subRational(command.clip.timelineEnd, command.clip.timelineStart);
    const snap =
      command.snap === false ? null : this.resolveClipBoundarySnap(command.startTime, duration);
    const startTime = snap?.startTime ?? command.startTime;
    const placedClip = createClipSnapshot(command.clip, {
      timelineStart: startTime,
      timelineEnd: addRational(startTime, duration),
    });
    shiftClipKeyframes(placedClip, subRational(startTime, command.clip.timelineStart));
    return placedClip;
  }

  private createPlacedClipFromGroupPlacement(
    command: TimelineInsertClipGroupEditCommand | TimelineOverwriteClipGroupEditCommand,
    placement: TimelineClipGroupPlacement
  ): Clip {
    const snap = this.resolveClipGroupPlacementSnap(command);
    return this.resolveGroupPlacement(placement, snap.deltaTime).clip;
  }

  private resolveClipGroupPlacementSnap(
    command: TimelineInsertClipGroupEditCommand | TimelineOverwriteClipGroupEditCommand
  ): { deltaTime: RationalTime | null; result: TimelineSnapResult | null } {
    const primaryPlacement = command.placements[0];
    if (primaryPlacement === undefined || command.snap === false) {
      return { deltaTime: null, result: null };
    }

    const duration = subRational(
      primaryPlacement.clip.timelineEnd,
      primaryPlacement.clip.timelineStart
    );
    const snap = this.resolveClipBoundarySnap(primaryPlacement.startTime, duration);
    if (snap === null) {
      return { deltaTime: null, result: null };
    }

    return {
      deltaTime: subRational(snap.startTime, primaryPlacement.startTime),
      result: snap.result,
    };
  }

  private resolveGroupPlacement(
    placement: TimelineClipGroupPlacement,
    snapDeltaTime: RationalTime | null
  ): { clip: Clip } {
    const duration = subRational(placement.clip.timelineEnd, placement.clip.timelineStart);
    const startTime =
      snapDeltaTime === null
        ? placement.startTime
        : addRational(placement.startTime, snapDeltaTime);
    const placedClip = createClipSnapshot(placement.clip, {
      timelineStart: startTime,
      timelineEnd: addRational(startTime, duration),
    });
    shiftClipKeyframes(placedClip, subRational(startTime, placement.clip.timelineStart));
    return { clip: placedClip };
  }

  private resolveClipBoundarySnap(startTime: RationalTime, duration: RationalTime) {
    const snapStart = this.resolveSnap(startTime, false);
    const candidateEnd = addRational(startTime, duration);
    const snapEnd = this.resolveSnap(candidateEnd, false);
    if (snapStart !== null && snapEnd !== null) {
      return Math.abs(snapStart.deltaSeconds) <= Math.abs(snapEnd.deltaSeconds)
        ? { startTime: snapStart.snappedTime, result: snapStart }
        : { startTime: subRational(snapEnd.snappedTime, duration), result: snapEnd };
    }
    if (snapStart !== null) {
      return { startTime: snapStart.snappedTime, result: snapStart };
    }
    if (snapEnd !== null) {
      return { startTime: subRational(snapEnd.snappedTime, duration), result: snapEnd };
    }
    return null;
  }

  private resolveTrackOverwrite(track: Track, winner: Clip) {
    const newClips: Clip[] = [];
    const changedClips: Clip[] = [];
    const createdClips: Clip[] = [];
    const createdClipEvents: TimelineCreatedClipEvent[] = [];
    const removedClips: Clip[] = [];
    const impacts: TimelineEditImpact[] = [];

    for (const clip of track.clips) {
      if (clip.id === winner.id) {
        newClips.push(clip);
        continue;
      }

      const overlap =
        compareRational(winner.timelineStart, clip.timelineEnd) < 0 &&
        compareRational(winner.timelineEnd, clip.timelineStart) > 0;
      if (!overlap) {
        newClips.push(clip);
        continue;
      }

      const originalClip = createClipSnapshot(clip);
      const resultClips: Clip[] = [];
      if (
        compareRational(winner.timelineStart, clip.timelineStart) <= 0 &&
        compareRational(winner.timelineEnd, clip.timelineEnd) >= 0
      ) {
        removedClips.push(originalClip);
      } else if (
        compareRational(winner.timelineStart, clip.timelineStart) > 0 &&
        compareRational(winner.timelineEnd, clip.timelineEnd) < 0
      ) {
        const leftClip = createClipSnapshot(clip, { timelineEnd: winner.timelineStart });
        const rightClip = createClipSnapshot(clip, {
          id: crypto.randomUUID(),
          timelineStart: winner.timelineEnd,
          sourceStart: addRational(
            clip.sourceStart,
            subRational(winner.timelineEnd, clip.timelineStart)
          ),
        });
        filterClipKeyframesToClipRange(leftClip);
        filterClipKeyframesToClipRange(rightClip);
        resultClips.push(leftClip, rightClip);
        createdClips.push(createClipSnapshot(rightClip));
        createdClipEvents.push({
          clip: createClipSnapshot(rightClip),
          reason: 'overwrite-split',
          originClipId: clip.id,
        });
      } else if (compareRational(winner.timelineStart, clip.timelineStart) <= 0) {
        const changedClip = createClipSnapshot(clip, {
          timelineStart: winner.timelineEnd,
          sourceStart: addRational(
            clip.sourceStart,
            subRational(winner.timelineEnd, clip.timelineStart)
          ),
        });
        filterClipKeyframesToClipRange(changedClip);
        resultClips.push(changedClip);
      } else {
        const changedClip = createClipSnapshot(clip, { timelineEnd: winner.timelineStart });
        filterClipKeyframesToClipRange(changedClip);
        resultClips.push(changedClip);
      }

      newClips.push(...resultClips);
      changedClips.push(...resultClips.map((resultClip) => createClipSnapshot(resultClip)));
      impacts.push({
        clipId: clip.id,
        trackId: track.id,
        originalClip,
        resultClips: resultClips.map((resultClip) => createClipSnapshot(resultClip)),
        effect:
          resultClips.length === 0
            ? 'remove'
            : resultClips.length > 1
              ? 'split'
              : compareRational(winner.timelineStart, clip.timelineStart) <= 0
                ? 'trim-start'
                : 'trim-end',
        affectedStartTime: maxRational(winner.timelineStart, clip.timelineStart),
        affectedEndTime: minRational(winner.timelineEnd, clip.timelineEnd),
        cutStart: compareRational(winner.timelineStart, clip.timelineStart) <= 0,
        cutEnd: compareRational(winner.timelineEnd, clip.timelineEnd) >= 0,
      });
    }

    track.clips = newClips;
    this.sortTrackClips(track);
    return { changedClips, createdClips, createdClipEvents, removedClips, impacts };
  }

  private getClipInTracks(
    tracks: Track[],
    clipId: string
  ): { track: Track; clip: Clip; trackIndex: number; clipIndex: number } | undefined {
    for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
      const track = tracks[trackIndex];
      for (let clipIndex = 0; clipIndex < track.clips.length; clipIndex++) {
        const clip = track.clips[clipIndex];
        if (clip.id === clipId) {
          return { track, clip, trackIndex, clipIndex };
        }
      }
    }
    return undefined;
  }

  // --- Playback ---

  /**
   * Starts playhead playback.
   *
   * @param options - Optional playback clock and range behavior.
   */
  play(options: PlaybackOptions = {}): boolean {
    return this.playbackManager.play(options);
  }

  /**
   * Stops playhead playback and clears the active animation frame.
   */
  pause() {
    this.playbackManager.pause();
  }

  /**
   * Updates the playback speed multiplier.
   *
   * @param rate - Playback multiplier where `1` is real time.
   */
  setPlaybackRate(rate: number) {
    assertPositiveTimelineNumber(rate, 'rate');
    this.playbackManager.setPlaybackRate(rate);
  }

  /**
   * Returns the current playback speed multiplier.
   */
  getPlaybackRate() {
    return this.playbackManager.getPlaybackRate();
  }

  // --- Track Targeting & Groups ---

  /**
   * Enables, disables, or toggles track targeting.
   *
   * @param trackId - Track id to update.
   * @param targeted - Explicit targeted state, or omitted to toggle.
   */
  toggleTrackTarget(trackId: string, targeted?: boolean) {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (track) {
      track.targeted = targeted !== undefined ? targeted : !track.targeted;
      this.emit('state:settled');
      this.emit('render');
    }
  }

  /**
   * Assigns a track to a group or removes it from grouping.
   *
   * @param trackId - Track id to update.
   * @param groupId - Group id to assign, or `undefined` to clear the group.
   */
  setTrackGroup(trackId: string, groupId: string | undefined) {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (track) {
      track.groupId = groupId;
      this.emit('state:settled');
      this.emit('render');
    }
  }

  // --- Undo / Redo ---

  /**
   * Stores the current track and marker state in undo history.
   */
  snapshot() {
    this.historyManager.snapshot();
  }

  /**
   * Restores the previous undo-history snapshot when available.
   */
  undo() {
    this.historyManager.undo();
  }

  /**
   * Restores the next redo-history snapshot when available.
   */
  redo() {
    this.historyManager.redo();
  }

  /**
   * Whether an undo snapshot is available.
   */
  get canUndo() {
    return this.historyManager.canUndo;
  }

  /**
   * Whether a redo snapshot is available.
   */
  get canRedo() {
    return this.historyManager.canRedo;
  }

  // --- Clipboard ---

  /**
   * Copies selected clips into the engine clipboard.
   */
  copySelection() {
    this.clipboardManager.copySelection();
  }

  /**
   * Copies selected clips into the clipboard, then removes them from their tracks.
   */
  cutSelection() {
    this.clipboardManager.cutSelection();
  }

  /**
   * Pastes clipboard clips at a timeline time.
   *
   * Relative offsets between copied clips are preserved. When no target track is
   * supplied, the first targeted track is used, then the first track as fallback.
   *
   * @param time - Timeline time for the earliest pasted clip.
   * @param targetTrackId - Optional destination track id.
   */
  pasteSelection(time: RationalTime, targetTrackId?: string) {
    this.clipboardManager.pasteSelection(time, targetTrackId);
  }

  /**
   * Number of clips currently stored in the engine clipboard.
   */
  get clipboardCount() {
    return this.clipboardManager.count;
  }

  /**
   * Whether copied clips are available to paste.
   */
  get canPasteSelection() {
    return this.clipboardManager.canPaste;
  }

  // --- Getters ---

  /**
   * Returns the current engine state object.
   */
  getState(): TimelineState {
    return this.state;
  }

  /**
   * Returns the current playhead time.
   */
  getTime(): RationalTime {
    return this.state.playheadTime;
  }

  /**
   * Converts a timeline time to a horizontal pixel coordinate.
   *
   * @param time - Timeline time to project into viewport space.
   * @returns Pixel coordinate relative to the current scroll offset.
   */
  timeToPixel(time: RationalTime): number {
    assertValidRationalTime(time, 'time');
    return toSeconds(time) * this.state.zoomScale - this.state.scrollLeft;
  }

  /**
   * Converts a horizontal pixel coordinate to timeline time.
   *
   * @param pixel - Pixel coordinate relative to the current viewport.
   * @param rate - Tick rate for the returned rational time.
   * @returns Timeline time represented by the pixel.
   */
  pixelToTime(pixel: number, rate: number = 24000): RationalTime {
    assertValidTimelineNumber(pixel, 'pixel');
    return fromSeconds((pixel + this.state.scrollLeft) / this.state.zoomScale, rate);
  }

  /**
   * Moves the playhead to an absolute timeline time.
   *
   * Alias for `updatePlayhead` that reads naturally in external media sync code.
   *
   * @param time - Desired playhead time.
   */
  setTime(time: RationalTime) {
    this.updatePlayhead(time);
  }

  /**
   * Moves the playhead, clamped to the timeline content range.
   *
   * @param time - Desired playhead time.
   */
  updatePlayhead(time: RationalTime) {
    assertValidRationalTime(time, 'time');
    let clampedTime = maxRational({ v: 0, r: time.r }, time);
    clampedTime = minRational(clampedTime, this.maxContentTime);
    this.state.playheadTime = clampedTime;
    this.emit('playhead:scrub', clampedTime);
    this.checkClipIntersections();
  }

  private checkClipIntersections() {
    const time = this.state.playheadTime;
    const currentActive = new Set<string>();

    for (const { clip } of this.getActiveClips(time)) {
      currentActive.add(clip.id);
      if (!this.activeClips.has(clip.id)) {
        this.emit('clip:enter', { clipId: clip.id, time });
      } else {
        this.emit('clip:update', { clipId: clip.id, time });
      }
    }

    for (const id of this.activeClips) {
      if (!currentActive.has(id)) {
        this.emit('clip:leave', { clipId: id, time });
      }
    }

    this.activeClips = currentActive;
  }

  /**
   * Moves a clip to a new timeline start time and optionally into another track.
   *
   * Honors track and clip movement locks, track-kind compatibility, min/max
   * bounds, snapping, and overwrite preview state when a drag is active.
   *
   * @param options - Clip move target, snapping, and cross-kind behavior.
   * @returns Whether the move was applied.
   */
  moveClip(options: TimelineClipMoveOptions): boolean {
    assertValidRationalTime(options.startTime, 'options.startTime');
    if (this.dragSnapshot) {
      this.state.tracks = createTrackSnapshots(JSON.parse(this.dragSnapshot));
    }

    const found = this.getClip(options.clipId);
    if (!found || found.clip.movable === false || found.track.locked) {
      return false;
    }

    const targetTrackId = options.targetTrackId ?? found.track.id;
    const targetTrackIndex = this.state.tracks.findIndex((track) => track.id === targetTrackId);
    if (targetTrackIndex === -1) {
      return false;
    }

    const targetTrack = this.state.tracks[targetTrackIndex];
    if (targetTrack.locked) {
      return false;
    }
    if (targetTrack.kind !== found.track.kind && options.allowCrossKindTrackMove !== true) {
      return false;
    }
    const linkedClipIds = this.getLinkedClipIds(options.clipId);
    if (linkedClipIds.length > 1 && targetTrack.id !== found.track.id) {
      return false;
    }
    for (const linkedClipId of linkedClipIds) {
      const linked = this.getClip(linkedClipId);
      if (!linked || linked.clip.movable === false || linked.track.locked) {
        return false;
      }
    }

    const previousStartTime = cloneRationalTime(found.clip.timelineStart);
    const previousEndTime = cloneRationalTime(found.clip.timelineEnd);
    let actualStart = options.startTime;
    const duration = subRational(found.clip.timelineEnd, found.clip.timelineStart);

    if (options.snap !== false) {
      const snapStart = this.resolveSnap(actualStart, false);
      const candidateEnd = addRational(actualStart, duration);
      const snapEnd = this.resolveSnap(candidateEnd, false);
      if (snapStart !== null && snapEnd !== null) {
        if (Math.abs(snapStart.deltaSeconds) <= Math.abs(snapEnd.deltaSeconds)) {
          actualStart = snapStart.snappedTime;
          this.publishSnapFeedback(snapStart.feedback);
        } else {
          actualStart = subRational(snapEnd.snappedTime, duration);
          this.publishSnapFeedback(snapEnd.feedback);
        }
      } else if (snapStart !== null) {
        actualStart = snapStart.snappedTime;
        this.publishSnapFeedback(snapStart.feedback);
      } else if (snapEnd !== null) {
        actualStart = subRational(snapEnd.snappedTime, duration);
        this.publishSnapFeedback(snapEnd.feedback);
      } else {
        this.publishSnapFeedback(emptyTimelineSnapFeedback);
      }
    } else {
      this.publishSnapFeedback(emptyTimelineSnapFeedback);
    }

    if (found.clip.minStart !== undefined) {
      actualStart = maxRational(actualStart, found.clip.minStart);
    }

    let actualEnd = addRational(actualStart, duration);

    if (found.clip.maxEnd !== undefined && compareRational(actualEnd, found.clip.maxEnd) > 0) {
      actualEnd = found.clip.maxEnd;
      actualStart = subRational(actualEnd, duration);
    }

    const deltaTime = subRational(actualStart, previousStartTime);
    const changedClips: Clip[] = [];
    for (const linkedClipId of linkedClipIds) {
      const linked = this.getClip(linkedClipId);
      if (!linked) {
        return false;
      }
      const nextStart = addRational(linked.clip.timelineStart, deltaTime);
      const nextEnd = addRational(linked.clip.timelineEnd, deltaTime);
      if (
        (linked.clip.minStart !== undefined &&
          compareRational(nextStart, linked.clip.minStart) < 0) ||
        (linked.clip.maxEnd !== undefined && compareRational(nextEnd, linked.clip.maxEnd) > 0)
      ) {
        return false;
      }

      const movingClip =
        linkedClipId === options.clipId && targetTrack.id !== linked.track.id
          ? createClipSnapshot(linked.clip)
          : linked.clip;
      movingClip.timelineStart = nextStart;
      movingClip.timelineEnd = nextEnd;
      shiftClipKeyframes(movingClip, deltaTime);

      if (linkedClipId === options.clipId && targetTrack.id !== linked.track.id) {
        linked.track.clips.splice(linked.clipIndex, 1);
        targetTrack.clips.push(movingClip);
      }
      changedClips.push(createClipSnapshot(movingClip));
    }

    for (const track of this.state.tracks) {
      this.sortTrackClips(track);
    }

    if (this.dragSnapshot) {
      for (const linkedClipId of linkedClipIds) {
        this.applyOverwrites(linkedClipId);
      }
    }

    const moved = this.getClip(options.clipId);
    if (!moved) {
      return false;
    }

    const moveResult: TimelineClipMoveResult = {
      clipId: options.clipId,
      clip: moved.clip,
      sourceTrackId: found.track.id,
      destinationTrackId: moved.track.id,
      sourceTrackIndex: found.trackIndex,
      destinationTrackIndex: moved.trackIndex,
      sourceClipIndex: found.clipIndex,
      destinationClipIndex: moved.clipIndex,
      previousStartTime,
      previousEndTime,
      startTime: cloneRationalTime(moved.clip.timelineStart),
      endTime: cloneRationalTime(moved.clip.timelineEnd),
      changedClips,
    };
    const phase = this.dragSnapshot ? 'preview' : 'commit';
    this.emit('clip:move', { ...moveResult, phase });

    if (this.dragSnapshot) {
      this.pendingClipMoveCommitEvent = { ...moveResult, phase: 'commit' };
    } else {
      this.pendingClipMoveCommitEvent = null;
      this.invalidateContent();
      this.emit('render');
    }

    return true;
  }

  /**
   * Trims one edge of a clip to a new timeline time.
   *
   * Start trims also shift `sourceStart` so the visible source frame remains
   * aligned with the new timeline boundary.
   *
   * @param clipId - Clip id to trim.
   * @param edge - Which clip boundary to edit.
   * @param newTime - Desired boundary time.
   */
  trimClip(clipId: string, edge: 'start' | 'end', newTime: RationalTime) {
    assertValidRationalTime(newTime, 'newTime');
    let snapshotTaken = false;
    if (this.dragSnapshot) {
      this.state.tracks = createTrackSnapshots(JSON.parse(this.dragSnapshot));
    }
    const found = this.getClip(clipId);
    if (found && found.clip.resizable !== false) {
      const { clip } = found;

      const targetTime = this.resolveSnap(newTime)?.snappedTime ?? newTime;

      if (edge === 'start') {
        const minDuration = fromSeconds(0.01, targetTime.r);
        const maxStart = subRational(clip.timelineEnd, minDuration);
        const originalStart = clip.timelineStart;
        let actualStart = minRational(
          maxRational(targetTime, fromSeconds(0, targetTime.r)),
          maxStart
        );
        if (clip.minStart !== undefined) {
          actualStart = maxRational(actualStart, clip.minStart);
        }
        clip.timelineStart = actualStart;
        // sourceStart must shift accordingly
        const delta = subRational(clip.timelineStart, originalStart);
        clip.sourceStart = addRational(clip.sourceStart, delta);
      } else {
        const tenFrames = fromSeconds(0.01, targetTime.r);
        let actualEnd = maxRational(targetTime, addRational(clip.timelineStart, tenFrames));
        if (clip.maxEnd !== undefined) {
          actualEnd = minRational(actualEnd, clip.maxEnd);
        }
        clip.timelineEnd = actualEnd;
      }

      filterClipKeyframesToClipRange(clip);
      this.emit('clip:resize', { clip });
      if (!this.dragSnapshot) {
        this.invalidateContent();
      }

      if (this.dragSnapshot) {
        this.applyOverwrites(clipId);
      } else {
        this.emit('render');
      }

      if (!this.dragSnapshot && !snapshotTaken) {
        this.snapshot();
        snapshotTaken = true;
      }
    }
  }

  /**
   * Shifts a clip's source start without moving it on the timeline.
   *
   * @param clipId - Clip id to slip.
   * @param deltaTime - Source-time offset to apply.
   */
  slipClip(clipId: string, deltaTime: RationalTime) {
    assertValidRationalTime(deltaTime, 'deltaTime');
    const found = this.getClip(clipId);
    if (found && found.clip.resizable !== false) {
      found.clip.sourceStart = addRational(found.clip.sourceStart, deltaTime);
      if (toSeconds(found.clip.sourceStart) < 0) {
        found.clip.sourceStart = { v: 0, r: deltaTime.r };
      }
      this.emit('clip:slip', { clip: found.clip });
      this.invalidateContent();
      this.emit('state:settled');
      this.emit('render');
      this.snapshot();
    }
  }

  /**
   * Moves a clip by a relative timeline offset.
   *
   * @param clipId - Clip id to slide.
   * @param deltaTime - Timeline offset to apply.
   */
  slideClip(clipId: string, deltaTime: RationalTime) {
    assertValidRationalTime(deltaTime, 'deltaTime');
    // Basic slide: move clip in time by delta (similar to moveClip, but purely delta based)
    const found = this.getClip(clipId);
    if (found && found.clip.movable !== false) {
      this.moveClip({
        clipId,
        startTime: addRational(found.clip.timelineStart, deltaTime),
      });
    }
  }

  /**
   * Applies overwrite-edit rules for a clip against overlapping clips on its track.
   *
   * Fully covered clips are removed, partially covered clips are trimmed, and
   * clips split by the winner are divided into two segments.
   *
   * @param winningClipId - Clip id whose interval should overwrite overlaps.
   */
  applyOverwrites(winningClipId: string) {
    for (const track of this.state.tracks) {
      const winnerIndex = track.clips.findIndex((c) => c.id === winningClipId);
      if (winnerIndex === -1) {
        continue;
      }

      const isPreview = this.dragSnapshot !== null;
      const winner = track.clips[winnerIndex];
      const newClips: Clip[] = [];
      const createdClips: { clip: Clip; originClipId: string }[] = [];
      const removedClips: Clip[] = [];
      const impacts: TimelineEditImpact[] = [];

      for (const clip of track.clips) {
        if (clip.id === winningClipId) {
          newClips.push(clip);
          continue;
        }

        // Check for overlap
        const overlap =
          compareRational(winner.timelineStart, clip.timelineEnd) < 0 &&
          compareRational(winner.timelineEnd, clip.timelineStart) > 0;
        if (!overlap) {
          newClips.push(clip);
          continue;
        }

        // Handle overlap (Premiere style overwrite)
        if (
          compareRational(winner.timelineStart, clip.timelineStart) <= 0 &&
          compareRational(winner.timelineEnd, clip.timelineEnd) >= 0
        ) {
          // Winner completely covers clip -> clip is deleted (don't push to newClips)
          removedClips.push(createClipSnapshot(clip));
          if (isPreview) {
            impacts.push({
              clipId: clip.id,
              trackId: track.id,
              originalClip: createClipSnapshot(clip),
              resultClips: [],
              effect: 'remove',
              affectedStartTime: clip.timelineStart,
              affectedEndTime: clip.timelineEnd,
              cutStart: true,
              cutEnd: true,
            });
          }
        } else if (
          compareRational(winner.timelineStart, clip.timelineStart) > 0 &&
          compareRational(winner.timelineEnd, clip.timelineEnd) < 0
        ) {
          // Winner is entirely inside clip -> split clip
          const clip1 = createClipSnapshot(clip, {
            timelineEnd: winner.timelineStart,
            editPreview: { operation: 'overwrite', cutEnd: true },
          });
          const clip2 = createClipSnapshot(clip, {
            id: crypto.randomUUID(),
            timelineStart: winner.timelineEnd,
            sourceStart: addRational(
              clip.sourceStart,
              subRational(winner.timelineEnd, clip.timelineStart)
            ),
            editPreview: { operation: 'overwrite', cutStart: true },
          });
          filterClipKeyframesToClipRange(clip1);
          filterClipKeyframesToClipRange(clip2);
          newClips.push(clip1, clip2);
          createdClips.push({ clip: createClipSnapshot(clip2), originClipId: clip.id });
          if (isPreview) {
            impacts.push({
              clipId: clip.id,
              trackId: track.id,
              originalClip: createClipSnapshot(clip),
              resultClips: [createClipSnapshot(clip1), createClipSnapshot(clip2)],
              effect: 'split',
              affectedStartTime: winner.timelineStart,
              affectedEndTime: winner.timelineEnd,
              cutStart: true,
              cutEnd: true,
            });
          }
        } else if (compareRational(winner.timelineStart, clip.timelineStart) <= 0) {
          // Winner overlaps left side of clip
          const delta = subRational(winner.timelineEnd, clip.timelineStart);
          const newClip = createClipSnapshot(clip, {
            timelineStart: winner.timelineEnd,
            sourceStart: addRational(clip.sourceStart, delta),
            editPreview: { operation: 'overwrite', cutStart: true },
          });
          filterClipKeyframesToClipRange(newClip);
          newClips.push(newClip);
          if (isPreview) {
            impacts.push({
              clipId: clip.id,
              trackId: track.id,
              originalClip: createClipSnapshot(clip),
              resultClips: [createClipSnapshot(newClip)],
              effect: 'trim-start',
              affectedStartTime: clip.timelineStart,
              affectedEndTime: winner.timelineEnd,
              cutStart: true,
            });
          }
        } else {
          // Winner overlaps right side of clip
          const newClip = createClipSnapshot(clip, {
            timelineEnd: winner.timelineStart,
            editPreview: { operation: 'overwrite', cutEnd: true },
          });
          filterClipKeyframesToClipRange(newClip);
          newClips.push(newClip);
          if (isPreview) {
            impacts.push({
              clipId: clip.id,
              trackId: track.id,
              originalClip: createClipSnapshot(clip),
              resultClips: [createClipSnapshot(newClip)],
              effect: 'trim-end',
              affectedStartTime: winner.timelineStart,
              affectedEndTime: clip.timelineEnd,
              cutEnd: true,
            });
          }
        }
      }

      // Always ensure winner is kept
      if (!newClips.find((c) => c.id === winner.id)) {
        newClips.push(winner);
      }

      track.clips = newClips;
      this.sortTrackClips(track);
      if (!isPreview) {
        this.normalizeClipGroups();
        this.invalidateContent();
        for (const clip of removedClips) {
          this.emit('clip:removed', {
            clip,
            reason: 'overwrite',
          } satisfies ClipRemovedEvent);
        }
        for (const created of createdClips) {
          this.emit('clip:created', {
            clip: created.clip,
            originClipId: created.originClipId,
            reason: 'overwrite-split',
          } satisfies ClipCreatedEvent);
        }
      }
      this.emit('render');
      if (this.dragSnapshot) {
        this.editImpacts = createTimelineEditImpactsSnapshot(
          impacts.length > 0
            ? {
                operation: 'overwrite',
                sourceClipId: winner.id,
                sourceTrackId: track.id,
                impacts,
              }
            : null
        );
        this.emit('state:preview');
        this.emit('edit:impacts', this.editImpacts);
      }
      return;
    }
  }

  /**
   * Captures the current track state for live drag preview.
   */
  startDrag() {
    this.dragSnapshot = stringifyTrackSnapshots(this.state.tracks);
    this.editImpacts = null;
    this.pendingClipMoveCommitEvent = null;
  }

  /**
   * Ends live drag preview and clears temporary cut flags.
   */
  endDrag() {
    this.dragSnapshot = null;
    this.editImpacts = null;
    this.editPreview = null;
    this.editResolution = null;
    this.clearClipDropFeedback();
    for (const track of this.state.tracks) {
      for (const clip of track.clips) {
        delete clip.editPreview;
      }
    }
    this.invalidateContent();
    this.emit('render');
    this.emit('state:preview');
    this.emit('edit:preview', null);
    this.emit('edit:impacts', null);
  }

  /**
   * Finalizes an interaction, clears snap guides, snapshots history, and emits settled state.
   */
  settle() {
    if (this.state.snapFeedback.lines.length > 0 || this.state.snapFeedback.target !== null) {
      this.publishSnapFeedback(emptyTimelineSnapFeedback);
      this.emit('render');
    }
    this.clearClipDropFeedback();
    if (this.pendingClipMoveCommitEvent) {
      this.emit('clip:move', this.pendingClipMoveCommitEvent);
      this.pendingClipMoveCommitEvent = null;
    }
    this.snapshot();
    this.emit('state:settled');
  }

  /**
   * Selects one clip and clears selection from all others.
   *
   * @param clipId - Clip id to select, or `null` to clear clip selection.
   */
  selectClip(clipId: string | null) {
    const selectedClipIds = clipId === null ? [] : this.getLinkedClipIds(clipId);
    this.selectClips(selectedClipIds);
  }

  /**
   * Selects a set of clips and clears selection from all others.
   *
   * @param clipIds - Clip ids to select.
   */
  selectClips(clipIds: readonly string[]) {
    const selectedClipIds = new Set(clipIds);
    const selectedClips: Clip[] = [];
    let primaryClip: Clip | null = null;
    for (const track of this.state.tracks) {
      for (const clip of track.clips) {
        clip.selected = selectedClipIds.has(clip.id);
        if (clip.selected) {
          selectedClips.push(clip);
          primaryClip ??= clip;
        }
      }
    }
    this.emit('clip:select', {
      clipId: primaryClip?.id ?? null,
      clip: primaryClip,
      clipIds: selectedClips.map((clip) => clip.id),
      clips: selectedClips,
    });
    this.emit('render');
  }

  /**
   * Toggles one clip in the current multi-selection.
   *
   * @param clipId - Clip id to toggle.
   * @param selected - Optional explicit selected state.
   */
  toggleClipSelection(clipId: string, selected?: boolean) {
    if (this.getClip(clipId) === undefined) {
      return false;
    }
    const currentSelection = new Set(this.getSelectedClipIds());
    const nextSelected = selected ?? !currentSelection.has(clipId);
    if (nextSelected) {
      for (const linkedClipId of this.getLinkedClipIds(clipId)) {
        currentSelection.add(linkedClipId);
      }
    } else {
      for (const linkedClipId of this.getLinkedClipIds(clipId)) {
        currentSelection.delete(linkedClipId);
      }
    }
    this.selectClips([...currentSelection]);
    return true;
  }

  /**
   * Splits a clip into two clips at a timeline time.
   *
   * @param clipId - Clip id to split.
   * @param splitTime - Timeline time that must fall inside the clip bounds.
   * @returns Whether the split was applied.
   */
  splitClip(clipId: string, splitTime: RationalTime) {
    assertValidRationalTime(splitTime, 'splitTime');
    return this.commitEdit({ type: 'split', time: splitTime, clipIds: [clipId] }).committed;
  }

  /**
   * Updates user-facing clip display properties.
   *
   * @param clipId - Clip id to update.
   * @param properties - Partial set of clip label, opacity, and color values.
   * @returns Whether the clip was found and updated.
   */
  updateClipProperties(
    clipId: string,
    properties: Partial<Pick<Clip, 'label' | 'opacity' | 'color'>>
  ) {
    const found = this.getClip(clipId);
    if (found) {
      Object.assign(found.clip, properties);
      this.snapshot();
      this.emit('state:settled');
      this.emit('render');
      return true;
    }
    return false;
  }

  /**
   * Removes a clip from its containing track.
   *
   * @param clipId - Clip id to remove.
   * @returns Whether the clip was found and deleted.
   */
  deleteClip(clipId: string) {
    const found = this.getClip(clipId);
    if (found) {
      const clipIdsToRemove = new Set(this.getLinkedClipIds(clipId));
      const removedClips: Clip[] = [];
      for (const track of this.state.tracks) {
        track.clips = track.clips.filter((clip) => {
          if (clipIdsToRemove.has(clip.id)) {
            removedClips.push(createClipSnapshot(clip));
            return false;
          }
          return true;
        });
      }
      this.normalizeClipGroups();
      this.snapshot();
      this.invalidateContent();
      for (const clip of removedClips) {
        this.emit('clip:removed', {
          clip,
          reason: 'delete',
        } satisfies ClipRemovedEvent);
      }
      this.emit('state:settled');
      this.emit('render');
      return true;
    }
    return false;
  }

  /**
   * Current marker list.
   */
  get markers() {
    return this.state.markers ?? [];
  }

  /**
   * Adds a marker at a timeline time.
   *
   * @param time - Timeline time for the marker.
   * @param label - Optional visible marker label.
   * @param color - Optional marker color.
   * @param description - Optional longer marker note.
   * @returns The created marker.
   */
  addMarker(time: RationalTime, label?: string, color?: string, description?: string) {
    assertValidRationalTime(time, 'time');
    const marker = {
      id: crypto.randomUUID(),
      time,
      label,
      color,
      description,
    };
    if (!this.state.markers) {
      this.state.markers = [];
    }
    this.state.markers.push(marker);
    this.snapshot();
    this.emit('marker:add', { marker });
    this.emit('state:settled');
    this.emit('render');
    return marker;
  }

  /**
   * Removes a marker by id.
   *
   * @param id - Marker id to remove.
   * @returns Whether the marker was found and removed.
   */
  removeMarker(id: string) {
    if (this.state.markers) {
      const idx = this.state.markers.findIndex((m) => m.id === id);
      if (idx !== -1) {
        const removed = this.state.markers.splice(idx, 1)[0];
        this.snapshot();
        this.emit('marker:remove', { marker: removed });
        this.emit('state:settled');
        this.emit('render');
        return true;
      }
    }
    return false;
  }

  /**
   * Updates an existing marker.
   *
   * @param id - Marker id to update.
   * @param updates - Marker fields to merge into the existing marker.
   * @returns The updated marker, or `null` when no marker was found.
   */
  updateMarker(id: string, updates: Partial<Marker>) {
    if (updates.time !== undefined) {
      assertValidRationalTime(updates.time, 'updates.time');
    }
    if (this.state.markers) {
      const marker = this.state.markers.find((m) => m.id === id);
      if (marker) {
        Object.assign(marker, updates);
        this.snapshot();
        this.emit('marker:update', { marker });
        this.emit('state:settled');
        this.emit('render');
        return marker;
      }
    }
    return null;
  }

  /**
   * Appends a track to the timeline.
   *
   * @param track - Track to add. Its id should be unique within the timeline.
   */
  addTrack(track: Track) {
    const nextTrack = createTrackSnapshot(track);
    this.state.tracks.push(nextTrack);
    this.snapshot();
    this.emit('track:add', { track: nextTrack });
    this.invalidateContent();
    this.emit('state:settled');
    this.emit('render');
  }

  /**
   * Removes a track by id.
   *
   * @param trackId - Track id to remove.
   * @returns Whether the track was found and removed.
   */
  removeTrack(trackId: string) {
    const idx = this.state.tracks.findIndex((t) => t.id === trackId);
    if (idx !== -1) {
      const removed = this.state.tracks.splice(idx, 1)[0];
      const scrollChanged = this.clampScrollTop();
      this.normalizeClipGroups();
      this.snapshot();
      this.emit('track:remove', { track: removed });
      this.invalidateContent();
      if (scrollChanged) {
        this.emitScrollChange();
      }
      this.emit('state:settled');
      this.emit('render');
      return true;
    }
    return false;
  }

  /**
   * Enables, disables, or toggles a track's muted state.
   *
   * @param trackId - Track id to update.
   * @param muted - Explicit muted state, or omitted to toggle.
   */
  toggleMuteTrack(trackId: string, muted?: boolean) {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (track) {
      track.muted = muted !== undefined ? muted : !track.muted;
      this.snapshot();
      this.emit('track:mute', { trackId: track.id, muted: track.muted });
      this.invalidateContent();
      this.emit('state:settled');
      this.emit('render');
    }
  }

  /**
   * Enables, disables, or toggles a track's output visibility.
   *
   * @param trackId - Track id to update.
   * @param visible - Explicit visible state, or omitted to toggle.
   */
  toggleTrackVisibility(trackId: string, visible?: boolean) {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (track) {
      track.visible = visible !== undefined ? visible : !track.visible;
      this.snapshot();
      this.emit('track:visibility', { trackId: track.id, visible: track.visible });
      this.invalidateContent();
      this.emit('state:settled');
      this.emit('render');
    }
  }

  /**
   * Enables, disables, or toggles a track's locked state.
   *
   * @param trackId - Track id to update.
   * @param locked - Explicit locked state, or omitted to toggle.
   */
  toggleLockTrack(trackId: string, locked?: boolean) {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (track) {
      track.locked = locked !== undefined ? locked : !track.locked;
      this.emit('track:lock', { trackId: track.id, locked: track.locked });
      this.emit('state:settled');
      this.emit('render');
    }
  }

  /**
   * Selects one track and clears selection from all others.
   *
   * @param trackId - Track id to select, or `null` to clear track selection.
   */
  selectTrack(trackId: string | null) {
    for (const track of this.state.tracks) {
      track.selected = track.id === trackId;
    }
    this.emit('track:select', { trackId });
    this.emit('state:settled');
    this.emit('render');
  }

  /**
   * Updates a track's expanded display height.
   *
   * @param trackId - Track id to resize.
   * @param height - Expanded row height in pixels.
   */
  setTrackHeight(trackId: string, height: number) {
    assertPositiveTimelineNumber(height, 'height');
    this.setTrackHeights([{ trackId, height }]);
  }

  /**
   * Sets multiple expanded track heights and publishes a single settled/render cycle.
   *
   * @param updates - Track height updates to apply.
   * @param options - Optional viewport state to batch with the height changes.
   */
  setTrackHeights(
    updates: readonly TimelineTrackHeightUpdate[],
    options: TimelineTrackHeightBatchOptions = {}
  ) {
    const resizeEvents: TimelineTrackHeightUpdate[] = [];
    const previousScrollTop = this.state.scrollTop;

    for (const update of updates) {
      assertPositiveTimelineNumber(update.height, `height for track "${update.trackId}"`);
      const track = this.state.tracks.find((t) => t.id === update.trackId);
      if (!track || track.height === update.height) {
        continue;
      }

      track.height = update.height;
      resizeEvents.push({ trackId: track.id, height: update.height });
    }

    if (options.scrollTop !== undefined) {
      assertNonNegativeTimelineNumber(options.scrollTop, 'options.scrollTop');
      this.state.scrollTop = options.scrollTop;
    }

    this.state.scrollTop = Math.max(0, Math.min(this.state.scrollTop, this.maxScrollTop));
    const scrollChanged = this.state.scrollTop !== previousScrollTop;

    if (resizeEvents.length === 0 && !scrollChanged) {
      return;
    }

    for (const resizeEvent of resizeEvents) {
      this.emit('track:resize', resizeEvent);
    }
    if (scrollChanged) {
      this.emitScrollChange();
    }
    this.emit('state:settled');
    this.emit('render');
  }

  /**
   * Maximum timeline time used for playback and scroll clamping.
   */
  get maxContentTime(): RationalTime {
    if (this.state.duration !== undefined) {
      return this.state.duration;
    }
    let max = { v: 0, r: 24000 };
    for (const track of this.state.tracks) {
      if (track.clips) {
        for (const clip of track.clips) {
          if (compareRational(clip.timelineEnd, max) > 0) {
            max = clip.timelineEnd;
          }
        }
      }
    }
    return max;
  }

  /**
   * Maximum horizontal scroll offset for the current viewport and content duration.
   */
  get maxScrollLeft() {
    const viewportWidth = this.state.viewportWidth || 1000;
    const contentEndX = toSeconds(this.maxContentTime) * this.state.zoomScale;
    return Math.max(0, contentEndX - viewportWidth);
  }

  /**
   * Maximum vertical scroll offset for the current viewport and track stack.
   */
  get maxScrollTop() {
    const viewportHeight = this.state.viewportHeight ?? defaultTimelineViewportHeight;
    const contentHeight = this.getContentHeight();
    return Math.max(0, contentHeight - viewportHeight);
  }

  private getContentHeight(geometry: TimelineInteractionGeometry = {}) {
    const resolvedGeometry = resolveTimelineInteractionGeometry(geometry);
    return this.state.tracks.reduce(
      (height, track) => height + this.getTrackViewportHeight(track, resolvedGeometry),
      resolvedGeometry.rulerHeight
    );
  }

  private emitScrollChange() {
    this.emit('scroll:change', {
      scrollLeft: this.state.scrollLeft,
      scrollTop: this.state.scrollTop,
    });
  }

  private emitViewportResize() {
    this.emit('viewport:resize', {
      viewportWidth: this.state.viewportWidth,
      viewportHeight: this.state.viewportHeight,
    });
  }

  private clampScrollTop() {
    const clampedScrollTop = Math.max(0, Math.min(this.state.scrollTop, this.maxScrollTop));
    const changed = clampedScrollTop !== this.state.scrollTop;
    this.state.scrollTop = clampedScrollTop;
    return changed;
  }

  /**
   * Sets the zoom scale while keeping the viewport within content bounds.
   *
   * @param scale - Desired pixels-per-second zoom scale.
   */
  setZoomScale(scale: number) {
    assertPositiveTimelineNumber(scale, 'scale');
    const clampedScale = this.clampZoomScale(scale);

    this.state.zoomScale = clampedScale;
    const clampedScroll = Math.max(0, Math.min(this.state.scrollLeft, this.maxScrollLeft));
    this.state.scrollLeft = clampedScroll;

    this.emit('zoom:change', clampedScale);
    this.emitScrollChange();
    this.emit('render');
    this.emit('state:settled');
  }

  /**
   * Sets horizontal scroll offset, clamped to the valid scroll range.
   *
   * @param scroll - Desired horizontal scroll offset in pixels.
   */
  setScrollLeft(scroll: number) {
    assertNonNegativeTimelineNumber(scroll, 'scroll');
    const clamped = Math.max(0, Math.min(scroll, this.maxScrollLeft));
    this.state.scrollLeft = clamped;
    this.emitScrollChange();
    this.emit('render');
    this.emit('state:settled');
  }

  /**
   * Sets vertical scroll offset, clamped to the valid track stack scroll range.
   *
   * @param scroll - Desired vertical scroll offset in pixels.
   */
  setScrollTop(scroll: number) {
    assertNonNegativeTimelineNumber(scroll, 'scroll');
    this.state.scrollTop = scroll;
    this.clampScrollTop();
    this.emitScrollChange();
    this.emit('render');
    this.emit('state:settled');
  }

  /**
   * Sets or clears an explicit timeline duration.
   *
   * When a duration is set, zoom, scroll, and playhead are clamped to that
   * duration instead of the dynamic maximum clip end.
   *
   * @param duration - Explicit duration, or `undefined` to use clip content bounds.
   */
  setDuration(duration: RationalTime | undefined) {
    if (duration !== undefined) {
      assertValidRationalTime(duration, 'duration');
    }
    this.state.duration = duration;

    // clamp playhead and scroll if duration changed
    if (duration !== undefined) {
      if (compareRational(this.state.playheadTime, duration) > 0) {
        this.updatePlayhead(duration);
      }
      this.setZoomScale(this.state.zoomScale); // re-clamp zoom and scroll
    } else if (this.hasZoomConstraints()) {
      this.setZoomScale(this.state.zoomScale); // re-clamp zoom if just removing duration
    } else {
      this.setScrollLeft(this.state.scrollLeft); // re-clamp scroll if just removing duration
    }

    this.emit('render');
    this.emit('state:settled');
  }

  /**
   * Stores the visible timeline viewport width.
   *
   * @param width - Viewport width in pixels.
   */
  setViewportWidth(width: number) {
    assertNonNegativeTimelineNumber(width, 'width');
    this.state.viewportWidth = width;
    if (this.state.duration !== undefined || this.hasZoomConstraints()) {
      this.setZoomScale(this.state.zoomScale); // re-clamp zoom scale based on new width
    }
    this.emitViewportResize();
    this.emit('state:settled');
  }

  /**
   * Stores the visible timeline viewport height.
   *
   * @param height - Viewport height in pixels.
   */
  setViewportHeight(height: number) {
    assertNonNegativeTimelineNumber(height, 'height');
    this.state.viewportHeight = height;
    const scrollChanged = this.clampScrollTop();
    if (scrollChanged) {
      this.emitScrollChange();
    }
    this.emitViewportResize();
    this.emit('state:settled');
  }
}
