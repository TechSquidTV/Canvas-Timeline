import { findClipInTracks } from '#core/engine/clip-lookup';
import type { createDocumentSnapshot } from '#core/document-snapshot';
import {
  timelineCommandOk,
  timelineCommandFail,
  timelineCommandInvalidInput,
} from '#core/command-result';
import type { TimelineCommandResult } from '#core/command-result';
import { ClipboardManager } from '#core/clipboard';
import { TypedEventEmitter } from '#core/emitter';
import { TimelineMediaQueries } from '#core/engine/active-media';
import {
  getClipGroup,
  getClipGroupForClip,
  getEditCommandSourceClipId,
  getLinkedClipIds,
  normalizeClipGroupsForTracks,
  resolveInteractiveEdit,
  validateEditCommand,
} from '#core/engine/edit-evaluator';
import type { EditContext } from '#core/engine/edit-evaluator';
import {
  createClipDropFeedbackSnapshot,
  createTimelineEditImpactsSnapshot,
  emptyTimelineClipDropFeedback,
  emptyTimelineSnapFeedback,
  hasClipDropFeedback,
  isSameClipDropFeedback,
} from '#core/engine/feedback';
import {
  defaultTimelineMaxPixelsPerFrame,
  defaultTimelineViewportHeight,
  resolveTimelineInteractionGeometry,
} from '#core/engine/geometry';
import type { TimelineZoomConstraints } from '#core/engine/geometry';
import { TimelineGeometry } from '#core/engine/interaction-geometry';
import { KeyframePropertyRegistry } from '#core/engine/keyframe-property-registry';
import { TimelineKeyframes } from '#core/engine/keyframes';
import type {
  SnapPreparationOptions,
  TimelineSnapProvider,
  TimelineSnapProviderContext,
} from '#core/engine/snapping';
import type { TimelineResolvedEdit } from '#core/engine/types';
import type {
  ClipCreatedEvent,
  ClipRemovedEvent,
  ClipSplitEvent,
  EngineEventMap,
} from '#core/events';
import { HistoryManager } from '#core/history';
import type { TimelineHistoryOptions } from '#core/history';
import { PlaybackManager } from '#core/playback';
import { SnapIndex } from '#core/snapping';
import {
  assertNonNegativeTimelineNumber,
  assertPositiveTimelineNumber,
  assertValidTimelineNumber,
  cloneRationalTime,
  createClipGroupSnapshots,
  createMarkerSnapshots,
  createTrackSnapshot,
  createTrackSnapshots,
} from '#core/snapshot';
import { createTimelineReadSnapshot } from '#core/state-snapshot';
import type {
  Clip,
  ExternalPlaybackUpdate,
  Marker,
  PlaybackOptions,
  TimelineClipDropFeedback,
  TimelineClipGroup,
  TimelineCreateClipGroupOptions,
  TimelineEditCommand,
  TimelineEditCommitResult,
  TimelineEditImpacts,
  TimelineEditPolicy,
  TimelineEditPreview,
  TimelineEditValidationResult,
  TimelineInsertClipGroupOptions,
  TimelineInteractionGeometry,
  TimelineKeyframePropertyDefinition,
  TimelineKeyframePropertyId,
  TimelineRegisteredKeyframePropertyDefinition,
  TimelineSnapFeedback,
  TimelineSnapResult,
  TimelineSnapTarget,
  TimelineState,
  TimelineStateSnapshot,
  TimelineTrackHeightBatchOptions,
  TimelineTrackHeightUpdate,
  Track,
} from '#core/types';
import {
  assertValidRationalTime,
  compareRational,
  fromSeconds,
  maxRational,
  minRational,
  resolveTimecodeFrameRate,
  toSeconds,
} from '@techsquidtv/canvas-timeline-utils';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
export { shiftClipKeyframes } from '#core/engine/clip-keyframes';
export {
  defaultTimelineInteractionGeometry,
  defaultTimelineMaxPixelsPerFrame,
} from '#core/engine/geometry';
export type { TimelineZoomConstraints } from '#core/engine/geometry';
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

  private editImpacts: TimelineEditImpacts | null = null;
  private previewTracks: Track[] | null = null;
  private editPreview: TimelineEditPreview | null = null;

  private sortTrackClips(track: Track) {
    track.clips.sort((a, b) => compareRational(a.timelineStart, b.timelineStart));
  }

  /**
   * Current marker list.
   */
  get markers() {
    return this.getState().markers ?? [];
  }

  /**
   * Adds a marker at a timeline time.
   *
   * @param time - Timeline time for the marker.
   * @param label - Optional visible marker label.
   * @param color - Optional marker color.
   * @param description - Optional longer marker note.
   * @returns An owned copy of the created marker.
   */
  addMarker(time: RationalTime, label?: string, color?: string, description?: string) {
    assertValidRationalTime(time, 'time');
    const marker = {
      id: crypto.randomUUID(),
      time: cloneRationalTime(time),
      label,
      color,
      description,
    };
    if (!this.state.markers) {
      this.state.markers = [];
    }
    this.state.markers.push(marker);
    this.invalidateContent();
    this.snapshot();
    this.emit('marker:add', { marker: createMarkerSnapshots([marker])[0] });
    this.emit('state:settled');
    this.emit('render');
    return createMarkerSnapshots([marker])[0];
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
        this.invalidateContent();
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
   * @returns An owned copy of the updated marker, or `null` when no marker was found.
   */
  updateMarker(id: string, updates: Partial<Omit<Marker, 'id'>>) {
    if (updates.time !== undefined) {
      assertValidRationalTime(updates.time, 'updates.time');
    }
    if (this.state.markers) {
      const marker = this.state.markers.find((m) => m.id === id);
      if (marker) {
        if (updates.time !== undefined) {
          marker.time = cloneRationalTime(updates.time);
        }
        if (Object.hasOwn(updates, 'label')) {
          marker.label = updates.label;
        }
        if (Object.hasOwn(updates, 'color')) {
          marker.color = updates.color;
        }
        if (Object.hasOwn(updates, 'description')) {
          marker.description = updates.description;
        }
        if (Object.hasOwn(updates, 'snap')) {
          marker.snap = createMarkerSnapshots([{ ...marker, snap: updates.snap }])[0].snap;
        }
        this.invalidateContent();
        this.snapshot();
        this.emit('marker:update', { marker: createMarkerSnapshots([marker])[0] });
        this.emit('state:settled');
        this.emit('render');
        return createMarkerSnapshots([marker])[0];
      }
    }
    return null;
  }

  /**
   * Appends a track to the timeline.
   *
   * @param track - Track to add. Its id should be unique within the timeline.
   */
  addTrack(track: Track): TimelineCommandResult {
    const clipIds = new Set(
      this.state.tracks.flatMap((entry) => entry.clips.map((clip) => clip.id))
    );
    if (
      this.state.tracks.some((entry) => entry.id === track.id) ||
      track.clips.some((clip) => {
        if (clipIds.has(clip.id)) {
          return true;
        }
        clipIds.add(clip.id);
        return false;
      })
    ) {
      return timelineCommandFail('duplicate-id');
    }
    let nextTrack: Track;
    try {
      nextTrack = createTrackSnapshot(track);
    } catch (cause) {
      return timelineCommandInvalidInput('Invalid track.', cause);
    }
    this.state.tracks.push(nextTrack);
    this.invalidateContent();
    this.snapshot();
    this.emit('track:add', { track: nextTrack });

    this.emit('state:settled');
    this.emit('render');
    return timelineCommandOk();
  }

  /**
   * Removes a track by id.
   *
   * @param trackId - Track id to remove.
   * @returns Command success or a not-found failure.
   */
  removeTrack(trackId: string) {
    const idx = this.state.tracks.findIndex((t) => t.id === trackId);
    if (idx !== -1) {
      const removed = this.state.tracks.splice(idx, 1)[0];
      const scrollChanged = this.clampScrollTop();
      this.normalizeClipGroups();
      this.invalidateContent();
      this.snapshot();
      this.emit('track:remove', { track: removed });

      if (scrollChanged) {
        this.emitScrollChange();
      }
      this.emit('state:settled');
      this.emit('render');
      return timelineCommandOk();
    }
    return timelineCommandFail('not-found');
  }

  /**
   * Renames a track, or clears its app-defined name.
   * @param trackId - Track to rename.
   * @param name - New name, or undefined to use the default label.
   * @returns Success, not-found, or invalid-input without mutating on failure.
   */
  renameTrack(trackId: string, name: string | undefined): TimelineCommandResult {
    const track = this.state.tracks.find((entry) => entry.id === trackId);
    if (!track) {
      return timelineCommandFail('not-found');
    }
    if (name !== undefined && typeof name !== 'string') {
      return timelineCommandFail('invalid-input', 'name must be a string or undefined.');
    }
    if (track.name === name) {
      return timelineCommandOk();
    }
    track.name = name;
    this.commitTrackChange();
    return timelineCommandOk();
  }

  /**
   * Moves a track to a final zero-based row index as one undoable change.
   * @param trackId - Track to move.
   * @param toIndex - Final index within the existing track list.
   * @returns Success, not-found, or invalid-input without mutating on failure.
   */
  moveTrack(trackId: string, toIndex: number): TimelineCommandResult {
    const fromIndex = this.state.tracks.findIndex((entry) => entry.id === trackId);
    if (fromIndex < 0) {
      return timelineCommandFail('not-found');
    }
    if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= this.state.tracks.length) {
      return timelineCommandFail('invalid-input', 'toIndex must address an existing row.');
    }
    if (fromIndex === toIndex) {
      return timelineCommandOk();
    }
    const [track] = this.state.tracks.splice(fromIndex, 1);
    this.state.tracks.splice(toIndex, 0, track);
    this.commitTrackChange();
    return timelineCommandOk();
  }

  /**
   * Sets row collapse without changing its expanded height or media visibility.
   * @param trackId - Track to collapse or expand.
   * @param collapsed - Desired collapsed state.
   * @returns Success, not-found, or invalid-input without mutating on failure.
   */
  setTrackCollapsed(trackId: string, collapsed: boolean): TimelineCommandResult {
    const track = this.state.tracks.find((entry) => entry.id === trackId);
    if (!track) {
      return timelineCommandFail('not-found');
    }
    if (typeof collapsed !== 'boolean') {
      return timelineCommandFail('invalid-input', 'collapsed must be a boolean.');
    }
    if ((track.collapsed === true) === collapsed) {
      return timelineCommandOk();
    }
    track.collapsed = collapsed;
    this.commitTrackChange();
    return timelineCommandOk();
  }

  private commitTrackChange() {
    const scrollChanged = this.clampScrollTop();
    this.invalidateContent();
    this.snapshot();
    if (scrollChanged) {
      this.emitScrollChange();
    }
    this.emit('state:settled');
    this.emit('render');
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
      this.invalidateContent();
      this.snapshot();
      this.emit('track:mute', { trackId: track.id, muted: track.muted });

      this.emit('state:settled');
      this.emit('render');
      return timelineCommandOk();
    }
    return timelineCommandFail('not-found');
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
      this.invalidateContent();
      this.snapshot();
      this.emit('track:visibility', { trackId: track.id, visible: track.visible });

      this.emit('state:settled');
      this.emit('render');
      return timelineCommandOk();
    }
    return timelineCommandFail('not-found');
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
      this.invalidateContent();
      this.snapshot();
      this.emit('track:lock', { trackId: track.id, locked: track.locked });
      this.emit('state:settled');
      this.emit('render');
      return timelineCommandOk();
    }
    return timelineCommandFail('not-found');
  }

  /**
   * Selects one track and clears selection from all others.
   *
   * @param trackId - Track id to select, or `null` to clear track selection.
   */
  selectTrack(trackId: string | null): TimelineCommandResult {
    if (trackId !== null && !this.state.tracks.some((track) => track.id === trackId)) {
      return timelineCommandFail('not-found');
    }
    for (const track of this.state.tracks) {
      track.selected = track.id === trackId;
    }
    this.emit('track:select', { trackId });
    this.emit('state:settled');
    this.emit('render');
    return timelineCommandOk();
  }

  /**
   * Updates a track's expanded display height.
   *
   * @param trackId - Track id to resize.
   * @param height - Expanded row height in pixels.
   */
  setTrackHeight(trackId: string, height: number) {
    if (!this.state.tracks.some((track) => track.id === trackId)) {
      return timelineCommandFail('not-found');
    }
    if (!Number.isFinite(height) || height <= 0) {
      return timelineCommandFail('invalid-input', 'height must be a positive finite number.');
    }
    this.setTrackHeights([{ trackId, height }]);
    return timelineCommandOk();
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
    for (const update of updates) {
      assertPositiveTimelineNumber(update.height, `height for track "${update.trackId}"`);
    }
    if (options.scrollTop !== undefined) {
      assertNonNegativeTimelineNumber(options.scrollTop, 'options.scrollTop');
    }
    const resizeEvents: TimelineTrackHeightUpdate[] = [];
    const previousScrollTop = this.state.scrollTop;

    for (const update of updates) {
      const track = this.state.tracks.find((t) => t.id === update.trackId);
      if (!track || track.height === update.height) {
        continue;
      }

      track.height = update.height;
      resizeEvents.push({ trackId: track.id, height: update.height });
    }

    if (options.scrollTop !== undefined) {
      this.state.scrollTop = options.scrollTop;
    }

    this.state.scrollTop = Math.max(0, Math.min(this.state.scrollTop, this.maxScrollTop));
    const scrollChanged = this.state.scrollTop !== previousScrollTop;

    if (resizeEvents.length === 0 && !scrollChanged) {
      return;
    }

    if (resizeEvents.length > 0) {
      this.invalidateContent();
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
      (height, track) => height + this.geometry.getTrackViewportHeight(track, resolvedGeometry),
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
    this.state.duration = duration === undefined ? undefined : cloneRationalTime(duration);

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

  private previewIds = new Map<string, string>();
  private getEditContext(): EditContext {
    return {
      allocateId: (key) => {
        let id = this.previewIds.get(key);
        if (!id) {
          id = crypto.randomUUID();
          this.previewIds.set(key, id);
        }
        return id;
      },
      state: this.state,
      editPolicy: this.editPolicy,
      keyframeProperties: this.keyframeProperties,
      resolveSnap: (time, publish) => this.resolveSnap(time, publish),
    };
  }

  getClipGroup(id: string) {
    return getClipGroup(this.getEditContext(), id);
  }

  getClipGroupForClip(id: string) {
    return getClipGroupForClip(this.getEditContext(), id);
  }

  validateEdit(command: TimelineEditCommand): TimelineEditValidationResult {
    return validateEditCommand(this.getEditContext(), command);
  }

  /**
   * Resolves and publishes a non-mutating preview for an edit command.
   *
   * @param command - Command to preview.
   * @returns Shared preview result for renderer and headless UI consumers.
   */
  previewEdit(command: TimelineEditCommand): TimelineEditPreview {
    const context = this.getEditContext();
    const resolved = resolveInteractiveEdit(
      { ...context, allocateId: (key) => context.allocateId(`0:${key}`) },
      command
    );
    if (
      resolved.preview.valid &&
      (command.type === 'move' || command.type === 'trim') &&
      command.overwrite
    ) {
      for (const impact of resolved.preview.impacts) {
        const ids = new Set(impact.resultClips.map((clip) => clip.id));
        for (const track of resolved.tracks) {
          for (const clip of track.clips) {
            if (ids.has(clip.id)) {
              clip.editPreview = {
                operation: 'overwrite',
                cutStart: impact.cutStart,
                cutEnd: impact.cutEnd,
              };
            }
          }
        }
      }
    }
    this.previewTracks = resolved.preview.valid ? resolved.tracks : null;
    if (resolved.moveResult) {
      resolved.preview.moveResult = resolved.moveResult;
      this.emit('clip:move', { ...resolved.moveResult, phase: 'preview' });
    }
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
    return this.commitEdits([command])[0];
  }

  /** Validates and applies an ordered batch atomically as one undo step. */
  commitEdits(commands: readonly TimelineEditCommand[]): TimelineEditCommitResult[] {
    if (commands.length === 0) {
      return [];
    }
    const context = this.getEditContext();
    let state = context.state;
    const resolutions: TimelineResolvedEdit[] = [];
    for (const [index, command] of commands.entries()) {
      const resolved = resolveInteractiveEdit(
        { ...context, state, allocateId: (key) => context.allocateId(`${index}:${key}`) },
        command
      );
      resolutions.push(resolved);
      if (!resolved.preview.valid) {
        this.previewTracks = null;
        this.renderSnapshot = undefined;
        this.renderedTracks = null;
        this.publishEditPreview(resolved.preview);
        return resolutions.map(({ preview }) => ({
          command: preview.command,
          preview,
          committed: false,
        }));
      }
      state = {
        ...state,
        tracks: resolved.tracks,
        clipGroups: resolved.clipGroups ?? state.clipGroups,
      };
    }
    this.state.tracks = state.tracks;
    this.state.clipGroups = state.clipGroups;
    this.previewTracks = null;
    this.renderSnapshot = undefined;
    this.renderedTracks = null;
    this.normalizeClipGroups();
    for (const track of this.state.tracks) {
      this.sortTrackClips(track);
    }
    this.editPreview = null;
    this.editImpacts = null;
    this.invalidateContent();
    this.snapshot();
    const results = resolutions.map((resolved) => {
      this.emitEditCommitEvents(resolved);
      const result = {
        command: resolved.preview.command,
        preview: resolved.preview,
        committed: true,
      };
      this.emit('edit:commit', result);
      return result;
    });
    this.publishSnapFeedback(emptyTimelineSnapFeedback);
    this.emit('edit:preview', null);
    this.emit('edit:impacts', null);
    this.previewIds.clear();
    this.emit('state:settled');
    this.emit('render');
    return results;
  }

  /**
   * Clears the active command-layer edit preview and snap guides.
   */
  cancelEdit() {
    this.clearEditPreview();
    this.publishSnapFeedback(emptyTimelineSnapFeedback);
    this.emit('edit:preview', null);
    this.emit('edit:impacts', null);
    this.emit('state:preview');
    this.emit('render');
  }

  private clearEditPreview() {
    this.previewIds.clear();
    this.previewTracks = null;
    this.renderSnapshot = undefined;
    this.renderedTracks = null;
    this.editPreview = null;
    this.editImpacts = null;
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
    if (preview.impacts.length === 0 || preview.command.type === 'keyframes') {
      return null;
    }

    const sourceClipId = getEditCommandSourceClipId(this.getEditContext(), preview.command);
    const sourceTrackId = this.getEditCommandSourceTrackId(preview.command, sourceClipId);
    return createTimelineEditImpactsSnapshot({
      operation: preview.command.type,
      sourceClipId: sourceClipId ?? null,
      sourceTrackId,
      impacts: preview.impacts,
    });
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
      case 'keyframes':
      case 'move':
      case 'trim':
      case 'ripple-trim':
      case 'slip':
      case 'slide':
      case 'split':
      case 'delete-clips':
      case 'roll-trim':
        return sourceClipId !== undefined
          ? (this.geometry.getClip(sourceClipId)?.track.id ?? null)
          : null;
    }
  }

  private emitEditCommitEvents(resolved: TimelineResolvedEdit) {
    for (const change of resolved.keyframeChanges ?? []) {
      this.emit(change.type, { clipId: change.clipId, keyframe: change.keyframe });
    }
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
    if (options.id !== undefined && getClipGroup(this.getEditContext(), options.id) !== undefined) {
      return null;
    }

    for (const clipId of options.clipIds) {
      if (
        this.geometry.getClip(clipId) === undefined ||
        getClipGroupForClip(this.getEditContext(), clipId) !== undefined
      ) {
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

  private normalizeClipGroups() {
    this.state.clipGroups = normalizeClipGroupsForTracks(
      this.getEditContext(),
      this.state.clipGroups,
      this.state.tracks
    );
  }

  /** Returns currently selected clip IDs in timeline track order. */
  getSelectedClipIds() {
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

  /**
   * Returns clips contained by a group in group order.
   *
   * @param groupId - Clip group id to inspect.
   * @returns Group clip entries, or an empty array when the group is missing.
   */
  getClipGroupClips(groupId: string) {
    const group = getClipGroup(this.getEditContext(), groupId);
    if (group === undefined) {
      return [];
    }

    return group.clipIds.flatMap((clipId) => {
      const found = this.geometry.getClip(clipId);
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
    this.invalidateContent();
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
    this.invalidateContent();
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

    this.invalidateContent();
    this.snapshot();
    this.emit('state:settled');
    this.emit('render');
    return true;
  }

  /**
   * Inserts multiple clips on chosen tracks and groups them in one history entry.
   *
   * This convenience API uses the same grouped insert command pipeline as
   * `commitEdit({ type: 'insert-clip-group', ... })`, including validation,
   * edit policy checks, snapping, ripple behavior, lifecycle events, and undo
   * history.
   *
   * @param options - Placements and optional group metadata.
   * @returns The created group, or null when validation fails.
   */
  insertClipGroup(options: TimelineInsertClipGroupOptions): TimelineClipGroup | null {
    const groupId = options.groupId ?? crypto.randomUUID();
    const result = this.commitEdit({
      type: 'insert-clip-group',
      ...options,
      groupId,
    });
    if (!result.committed) {
      return null;
    }

    const group = getClipGroup(this.getEditContext(), groupId);
    if (group === undefined) {
      return null;
    }

    this.selectClips(group.clipIds);
    return group;
  }
  readonly geometry: TimelineGeometry;
  readonly keyframes: TimelineKeyframes;
  readonly media: TimelineMediaQueries;

  /**
   * Creates an instance of the TimelineEngine.
   *
   * @param initialState - Object containing initial tracks and optional configurations.
   * @param initialState.tracks - The track lanes and their visual clips.
   * @param initialState.markers - Optional list of initial navigation pins.
   * @param initialState.zoomScale - Optional initial zoom factor (pixels per second).
   * @param initialState.scrollLeft - Optional initial horizontal scroll pan in pixels.
   * @param initialState.scrollTop - Optional initial vertical scroll pan in pixels.
   * @param initialState.playheadTime - Optional initial playback cursor as a rational time.
   * @param initialState.inPoint - Optional restored playback range start.
   * @param initialState.outPoint - Optional restored playback range end.
   */
  constructor(initialState: {
    tracks: TimelineStateSnapshot['tracks'];
    history?: TimelineHistoryOptions;
    clipGroups?: TimelineStateSnapshot['clipGroups'];
    markers?: TimelineStateSnapshot['markers'];
    zoomScale?: number;
    scrollLeft?: number;
    scrollTop?: number;
    playheadTime?: RationalTime;
    duration?: RationalTime;
    inPoint?: RationalTime;
    outPoint?: RationalTime;
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
      playheadTime: cloneRationalTime(initialState.playheadTime ?? { v: 0, r: 24000 }),
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
      duration:
        initialState.duration === undefined ? undefined : cloneRationalTime(initialState.duration),
      inPoint:
        initialState.inPoint === undefined ? undefined : cloneRationalTime(initialState.inPoint),
      outPoint:
        initialState.outPoint === undefined ? undefined : cloneRationalTime(initialState.outPoint),
    };
    this.geometry = new TimelineGeometry({
      getState: () => this.getState(),
      getRenderState: () => this.getRenderState(),
      timeToPixel: (time) => this.timeToPixel(time),
      pixelToTime: (pixel, rate) => this.pixelToTime(pixel, rate),
    });
    this.keyframes = new TimelineKeyframes({
      state: this.state,
      geometry: this.geometry,
      keyframeProperties: this.keyframeProperties,
      emit: this.emit.bind(this),
      timeToPixel: (time) => this.timeToPixel(time),
      getRenderState: () => this.getRenderState(),
      commitEdit: (command) => this.commitEdit(command),
      previewEdit: (command) => this.previewEdit(command),
    });
    this.media = new TimelineMediaQueries({
      getState: () => this.getState(),
      getClip: (id) => this.geometry.getClip(id),
    });
    this.playbackManager = new PlaybackManager(this, this.state);
    this.historyManager = new HistoryManager(
      this,
      this.state,
      (snapshot) => this.restoreHistoryDocument(snapshot),
      initialState.history
    );
    this.clipboardManager = new ClipboardManager(this);
    this.normalizeClipGroups();
    this.keyframes.validateRegisteredClipKeyframes();

    if (this.state.duration !== undefined || this.hasZoomConstraints()) {
      this.state.zoomScale = this.clampZoomScale(this.state.zoomScale);
      this.state.scrollLeft = Math.max(0, Math.min(this.state.scrollLeft, this.maxScrollLeft));
    }
    this.clampScrollTop();
    this.snapshot();
  }

  /**
   * Current readonly track snapshots.
   */
  get tracks() {
    return this.getState().tracks;
  }

  /**
   * Current clip groups owned by the engine.
   */
  get clipGroups() {
    return this.getState().clipGroups;
  }

  /** Configured timeline frame rate for frame-accurate editing controls. */
  get frameRate() {
    return this.zoomConstraints.frameRate;
  }

  /** Monotonic revision for changes that can affect active layer lookup. */
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
   * Atomically replaces both In/Out boundaries without intermediate range clearing.
   * @param startTime - Inclusive, non-negative range start.
   * @param endTime - Exclusive range end, after the start.
   * @returns Success, or an input/range failure without changing either boundary.
   */
  setInOutRange(startTime: RationalTime, endTime: RationalTime): TimelineCommandResult {
    try {
      assertValidRationalTime(startTime, 'startTime');
      assertValidRationalTime(endTime, 'endTime');
    } catch (error) {
      return timelineCommandInvalidInput('Invalid In/Out range.', error);
    }
    if (startTime.v < 0 || compareRational(startTime, endTime) >= 0) {
      return timelineCommandFail('invalid-range');
    }
    this.state.inPoint = cloneRationalTime(startTime);
    this.state.outPoint = cloneRationalTime(endTime);
    this.publishSnapFeedback(emptyTimelineSnapFeedback);
    this.emit('state:inOut', { state: this.state });
    this.emit('render');
    return timelineCommandOk();
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

    this.state.inPoint = time === undefined ? undefined : cloneRationalTime(time);
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

    this.state.outPoint = time === undefined ? undefined : cloneRationalTime(time);
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
      this.invalidateContent();
      this.snapshot();
      this.emit('state:settled');
      this.emit('render');
      return timelineCommandOk();
    }
    return timelineCommandFail('not-found');
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
      this.invalidateContent();
      this.snapshot();
      this.emit('state:settled');
      this.emit('render');
      return timelineCommandOk();
    }
    return timelineCommandFail('not-found');
  }

  // --- Undo / Redo ---

  private restoreHistoryDocument(snapshot: ReturnType<typeof createDocumentSnapshot>) {
    const tracks = createTrackSnapshots(snapshot.tracks);
    const markers = createMarkerSnapshots(snapshot.markers);
    const clipGroups = createClipGroupSnapshots(snapshot.clipGroups);
    const previousScrollLeft = this.state.scrollLeft;
    const previousScrollTop = this.state.scrollTop;
    const previousZoomScale = this.state.zoomScale;
    this.state.tracks = tracks;
    this.state.markers = markers;
    this.state.clipGroups = clipGroups;
    this.clearEditPreview();
    this.state.zoomScale = this.clampZoomScale(this.state.zoomScale);
    this.state.scrollLeft = Math.max(0, Math.min(this.state.scrollLeft, this.maxScrollLeft));
    this.clampScrollTop();
    this.invalidateContent();
    this.publishSnapFeedback(emptyTimelineSnapFeedback);
    this.clearClipDropFeedback();
    this.emit('edit:preview', null);
    this.emit('edit:impacts', null);
    if (previousZoomScale !== this.state.zoomScale) {
      this.emit('zoom:change', this.state.zoomScale);
    }
    if (
      previousScrollLeft !== this.state.scrollLeft ||
      previousScrollTop !== this.state.scrollTop
    ) {
      this.emitScrollChange();
    }
    this.emit('state:settled');
    this.emit('render');
  }

  /**
   * Stores the current track and marker state in undo history.
   */
  snapshot() {
    this.historyManager.snapshot(this.selectionRevision);
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
    return this.clipboardManager.cutSelection();
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
    return this.clipboardManager.pasteSelection(time, targetTrackId);
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

  private renderSnapshot: TimelineStateSnapshot | undefined;
  private renderedTracks: Track[] | null = null;

  /** Returns readonly drawing content, including a non-mutating edit preview. */
  getRenderState(): TimelineStateSnapshot {
    if (!this.previewTracks) {
      return this.getState();
    }
    this.renderSnapshot = createTimelineReadSnapshot(
      { ...this.state, tracks: this.previewTracks },
      this.renderSnapshot,
      this.previewTracks !== this.renderedTracks
    );
    this.renderedTracks = this.previewTracks;
    return this.renderSnapshot;
  }

  private selectionRevision = 0;
  private readSnapshot: TimelineStateSnapshot | undefined;
  private documentSnapshotDirty = true;
  private snapshotDirty = true;

  /** Returns a stable, deeply readonly snapshot with owned document values. */
  getState(): TimelineStateSnapshot {
    if (this.snapshotDirty || !this.readSnapshot) {
      this.readSnapshot = createTimelineReadSnapshot(
        this.state,
        this.readSnapshot,
        this.documentSnapshotDirty
      );
      this.snapshotDirty = false;
      this.documentSnapshotDirty = false;
    }
    return this.readSnapshot;
  }

  override emit<Key extends keyof EngineEventMap>(
    event: Key,
    ...args: EngineEventMap[Key] extends void ? [] : [EngineEventMap[Key]]
  ) {
    if (['clip:select', 'keyframe:select', 'track:select'].includes(event)) {
      this.selectionRevision++;
    }
    this.snapshotDirty = true;
    if (
      [
        'content:change',
        'clip:select',
        'keyframe:select',
        'keyframe:add',
        'keyframe:update',
        'keyframe:remove',
        'track:select',
      ].includes(event)
    ) {
      this.documentSnapshotDirty = true;
    }
    super.emit(event, ...args);
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
    this.state.playheadTime = cloneRationalTime(clampedTime);
    this.emit('playhead:scrub', clampedTime);
    this.checkClipIntersections();
  }

  private checkClipIntersections() {
    const time = this.state.playheadTime;
    const currentActive = new Set<string>();

    for (const { clip } of this.media.getActiveClips(time)) {
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
   * Finalizes an interaction, clears snap guides, snapshots history, and emits settled state.
   */
  settle() {
    if (this.state.snapFeedback.lines.length > 0 || this.state.snapFeedback.target !== null) {
      this.publishSnapFeedback(emptyTimelineSnapFeedback);
      this.emit('render');
    }
    this.clearClipDropFeedback();
    this.snapshot();
    this.emit('state:settled');
  }

  /**
   * Selects one clip and clears selection from all others.
   *
   * @param clipId - Clip id to select, or `null` to clear clip selection.
   */
  selectClip(clipId: string | null): TimelineCommandResult {
    if (clipId !== null && !this.geometry.getClip(clipId)) {
      return timelineCommandFail('not-found');
    }
    const selectedClipIds = clipId === null ? [] : getLinkedClipIds(this.getEditContext(), clipId);
    return this.selectClips(selectedClipIds);
  }

  /**
   * Selects a set of clips and clears selection from all others.
   *
   * @param clipIds - Clip ids to select.
   */
  selectClips(clipIds: readonly string[]): TimelineCommandResult {
    const existingIds = new Set(
      this.state.tracks.flatMap((track) => track.clips.map((clip) => clip.id))
    );
    if (clipIds.some((id) => !existingIds.has(id))) {
      return timelineCommandFail('not-found');
    }
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
    return timelineCommandOk();
  }

  /**
   * Toggles one clip in the current multi-selection.
   *
   * @param clipId - Clip id to toggle.
   * @param selected - Optional explicit selected state.
   */
  toggleClipSelection(clipId: string, selected?: boolean) {
    if (this.geometry.getClip(clipId) === undefined) {
      return timelineCommandFail('not-found');
    }
    const currentSelection = new Set(this.getSelectedClipIds());
    const nextSelected = selected ?? !currentSelection.has(clipId);
    if (nextSelected) {
      for (const linkedClipId of getLinkedClipIds(this.getEditContext(), clipId)) {
        currentSelection.add(linkedClipId);
      }
    } else {
      for (const linkedClipId of getLinkedClipIds(this.getEditContext(), clipId)) {
        currentSelection.delete(linkedClipId);
      }
    }
    this.selectClips([...currentSelection]);
    return timelineCommandOk();
  }

  /**
   * Updates user-facing clip display properties.
   *
   * @param clipId - Clip id to update.
   * @param properties - Partial set of clip label, opacity, and color values.
   * @returns Command success or a not-found failure.
   */
  updateClipProperties(
    clipId: string,
    properties: Partial<Pick<Clip, 'label' | 'opacity' | 'color'>>
  ) {
    const found = findClipInTracks(this.state.tracks, clipId);
    if (found) {
      Object.assign(found.clip, properties);
      this.invalidateContent();
      this.snapshot();
      this.emit('state:settled');
      this.emit('render');
      return timelineCommandOk();
    }
    return timelineCommandFail('not-found');
  }
  /** Invalidates content-dependent queries and renderer snapshots. */
  invalidateContent() {
    this.state.contentRevision++;
    this.emit('content:change', this.state.contentRevision);
  }
}
