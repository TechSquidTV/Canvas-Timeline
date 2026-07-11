import type {
  Marker,
  TimelineInteractionGeometry,
  TimelineTrackHeightBatchOptions,
  TimelineTrackHeightUpdate,
  Track,
} from '#core/types';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import {
  assertValidRationalTime,
  compareRational,
  toSeconds,
} from '@techsquidtv/canvas-timeline-utils';
import {
  assertNonNegativeTimelineNumber,
  assertPositiveTimelineNumber,
  createTrackSnapshot,
} from '#core/snapshot';
import {
  defaultTimelineViewportHeight,
  resolveTimelineInteractionGeometry,
} from '#core/engine/geometry';
import { TimelineEngineGeometry } from '#core/engine/interaction-geometry';

export abstract class TimelineEngineState extends TimelineEngineGeometry {
  abstract updatePlayhead(time: RationalTime): void;
  protected abstract clampZoomScale(scale: number): number;
  protected abstract hasZoomConstraints(): boolean;

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

  protected clampScrollTop() {
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
