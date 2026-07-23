import type {
  Clip,
  TimelineClipDropFeedback,
  Marker,
  PlaybackOptions,
  ExternalPlaybackUpdate,
  TimelineClipMoveOptions,
  TimelineClipMoveResult,
  TimelineSnapFeedback,
  TimelineSnapResult,
  TimelineSnapTarget,
  TimelineEditImpact,
  TimelineEditImpacts,
  TimelineEditPolicy,
  TimelineEditPreview,
  TimelineClipGroup,
  TimelineKeyframePropertyDefinition,
  TimelineKeyframePropertyId,
  TimelineRegisteredKeyframePropertyDefinition,
  TimelineState,
  Track,
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
  type TimelineZoomConstraints,
} from '#core/engine/geometry';
import { filterClipKeyframesToClipRange, shiftClipKeyframes } from '#core/engine/clip-keyframes';
import type {
  SnapPreparationOptions,
  TimelineSnapProvider,
  TimelineSnapProviderContext,
} from '#core/engine/snapping';
import { TimelineEngineState } from '#core/engine/timeline-state';

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
export class TimelineEngine extends TimelineEngineState {
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
  override get contentRevision() {
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

  protected override hasZoomConstraints() {
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

  protected override clampZoomScale(scale: number) {
    return Math.max(this.minZoomScale, Math.min(scale, this.maxZoomScale));
  }

  /**
   * Plays the timeline.
   */
  play(options: PlaybackOptions = {}): boolean {
    if (this.state.playing) {
      return false;
    }
    const startTime = this.playbackManager.prepareStart(options);
    if (compareRational(startTime, this.state.playheadTime) !== 0) {
      this.updatePlayhead(startTime);
    }
    return this.playbackManager.play(options);
  }

  /** Resolves exhausted Out-point and loop-duration starts to the active range start. */
  getPlaybackStartTime(options: PlaybackOptions = {}): RationalTime {
    return this.playbackManager.prepareStart(options);
  }

  /** Advances externally clocked playback through the shared range policy. */
  updateExternalPlaybackTime(time: RationalTime): ExternalPlaybackUpdate {
    assertValidRationalTime(time, 'time');
    return this.playbackManager.updateExternalTime(time);
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
  override pixelToTime(pixel: number, rate: number = 24000): RationalTime {
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
  override updatePlayhead(time: RationalTime) {
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
}
