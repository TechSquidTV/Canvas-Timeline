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
  TimelineClipRect,
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
  TimelineEditPreview,
  TimelineInteractionGeometry,
  TimelineClipGroup,
  TimelineKeyframePropertyDefinition,
  TimelineKeyframePropertyId,
  TimelineRegisteredKeyframePropertyDefinition,
  TimelineState,
  TrackHitTestInput,
  Track,
  VisibleTimelineClip,
  VisibleTimelineClipOptions,
} from '#core/types';
import type { ClipCreatedEvent, ClipRemovedEvent } from '#core/events';
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
  assertValidTimelineNumber,
  cloneRationalTime,
  createClipSnapshot,
  createClipGroupSnapshots,
  createMarkerSnapshots,
  createTrackSnapshot,
  createTrackSnapshots,
  stringifyTrackSnapshots,
} from '#core/snapshot';
import {
  emptyTimelineClipDropFeedback,
  emptyTimelineSnapFeedback,
  createClipDropFeedbackSnapshot,
  createTimelineEditImpactsSnapshot,
  hasClipDropFeedback,
  isSameClipDropFeedback,
} from '#core/engine/feedback';
import {
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
  SnapPreparationOptions,
  TimelineSnapProvider,
  TimelineSnapProviderContext,
} from '#core/engine/snapping';
import {
  createClipSourceRange,
  createClipSyncKey,
  mapSourceTimeToTimelineTime,
  mapTimelineTimeToSourceTime,
} from '#core/engine/media-sync';
import { TimelineEngineKeyframes } from '#core/engine/keyframes';

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

/**
 * TimelineEngine
 *
 * The central orchestrator and coordinator for the high-performance timeline editor.
 * Maintains state (tracks, clips, markers, playhead position, zoom scale, scrolls, snaps),
 * builds dynamic snap indexes for magnetic snap guidance, handles split and edit actions,
 * and publishes state events to trigger low-latency canvas renderings and lightweight React layouts.
 */
export class TimelineEngine extends TimelineEngineKeyframes {
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

  protected override publishSnapFeedback(feedback: TimelineSnapFeedback) {
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

  protected override forEachTimelineClipGeometry<TrackKind>(
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

  /**
   * Plays the timeline.
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
