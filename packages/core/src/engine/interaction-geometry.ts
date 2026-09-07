import {
  defaultTimelineViewportWidth,
  normalizeViewportCoordinate,
  resolveTimelineInteractionGeometry,
} from '#core/engine/geometry';
import type { ResolvedTimelineInteractionGeometry } from '#core/engine/geometry';
import { createClipSourceRange } from '#core/engine/media-sync';
import type {
  Clip,
  ClipHitRegion,
  ClipHitTestInput,
  ClipHitTestResult,
  ClipViewportRect,
  TimelineClipGeometryOptions,
  TimelineClipRect,
  TimelineInteractionGeometry,
  TimelineState,
  TimelineTrackGeometryOptions,
  TimelineTrackHitTestResult,
  TimelineTrackRect,
  Track,
  TrackHitTestInput,
  VisibleTimelineClip,
  VisibleTimelineClipOptions,
} from '#core/types';
import {
  addRational,
  compareRational,
  maxRational,
  minRational,
  subRational,
} from '@techsquidtv/canvas-timeline-utils';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
interface GeometryContext {
  getState: () => TimelineState;
  getRenderState: () => TimelineState;
  timeToPixel: (time: RationalTime) => number;
  pixelToTime: (pixel: number, rate?: number) => RationalTime;
}

/** Clip lookup and viewport geometry for a timeline engine. */
export class TimelineGeometry {
  constructor(private context: GeometryContext) {}

  /**
   * Locates a clip and returns its containing track and indexes.
   *
   * @param clipId - Clip id to look up.
   * @returns Clip lookup details, or `undefined` when the clip is not found.
   */
  getClip(
    clipId: string
  ): { track: Track; clip: Clip; trackIndex: number; clipIndex: number } | undefined {
    for (let trackIndex = 0; trackIndex < this.context.getState().tracks.length; trackIndex++) {
      const track = this.context.getState().tracks[trackIndex];
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
      options.viewportWidth ?? this.context.getState().viewportWidth ?? defaultTimelineViewportWidth
    );
    const scrollTop = this.context.getState().scrollTop;
    const trackRects: TimelineTrackRect[] = [];
    let y = resolvedGeometry.rulerHeight - scrollTop;

    for (
      let trackIndex = 0;
      trackIndex < this.context.getRenderState().tracks.length;
      trackIndex++
    ) {
      const track = this.context.getRenderState().tracks[trackIndex];
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
  getTrackAtPoint(input: TrackHitTestInput): TimelineTrackHitTestResult | null {
    const resolvedGeometry = resolveTimelineInteractionGeometry(input);
    if (input.y < resolvedGeometry.rulerHeight) {
      return null;
    }

    for (const rect of this.getTrackRects(input)) {
      const track = this.context.getRenderState().tracks[rect.trackIndex];
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
    let y = resolvedGeometry.rulerHeight - this.context.getState().scrollTop;

    for (
      let trackIndex = 0;
      trackIndex < this.context.getRenderState().tracks.length;
      trackIndex++
    ) {
      const track = this.context.getRenderState().tracks[trackIndex];
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
  getClipRects(options: TimelineClipGeometryOptions = {}): TimelineClipRect[] {
    const clipRects: TimelineClipRect[] = [];

    this.forEachTimelineClipGeometry(options, (track, clip, trackIndex, clipIndex, rect) => {
      clipRects.push(this.createTimelineClipRect(track, clip, trackIndex, clipIndex, rect));
    });

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
  getVisibleTimelineClips(options: VisibleTimelineClipOptions = {}): VisibleTimelineClip[] {
    const resolvedGeometry = resolveTimelineInteractionGeometry(options);
    const viewportWidth = Math.max(
      0,
      options.viewportWidth ?? this.context.getState().viewportWidth ?? defaultTimelineViewportWidth
    );
    const viewportHeight =
      options.viewportHeight === undefined ? undefined : Math.max(0, options.viewportHeight);
    const overscanPixels = Math.max(0, options.overscanPixels ?? 0);
    const minX = -overscanPixels;
    const maxX = viewportWidth + overscanPixels;
    const minY = resolvedGeometry.rulerHeight - overscanPixels;
    const maxY = viewportHeight === undefined ? undefined : viewportHeight + overscanPixels;
    const visibleClips: VisibleTimelineClip[] = [];

    this.forEachTimelineClipGeometry(options, (track, clip, trackIndex, clipIndex, rect) => {
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
        this.context.pixelToTime(visibleLeft, clip.timelineStart.r)
      );
      const visibleTimelineEndTime = minRational(
        clip.timelineEnd,
        this.context.pixelToTime(visibleRight, clip.timelineEnd.r)
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
    });

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

    let trackY = resolvedGeometry.rulerHeight - this.context.getState().scrollTop;

    for (
      let trackIndex = 0;
      trackIndex < this.context.getRenderState().tracks.length;
      trackIndex++
    ) {
      const track = this.context.getRenderState().tracks[trackIndex];
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

  /** @internal Shared row geometry for engine services. */
  getTrackViewportHeight(track: Track, geometry: ResolvedTimelineInteractionGeometry): number {
    return Math.floor(
      track.collapsed ? geometry.collapsedTrackHeight : (track.height ?? geometry.trackHeight)
    );
  }

  /** @internal Visits drawing geometry for composed services. */
  forEachTimelineClipGeometry(
    options: TimelineClipGeometryOptions,
    visit: (
      track: Track,
      clip: Clip,
      trackIndex: number,
      clipIndex: number,
      rect: ClipViewportRect
    ) => void
  ): void {
    const resolvedGeometry = resolveTimelineInteractionGeometry(options);
    let y = resolvedGeometry.rulerHeight - this.context.getState().scrollTop;

    for (
      let trackIndex = 0;
      trackIndex < this.context.getRenderState().tracks.length;
      trackIndex++
    ) {
      const track = this.context.getRenderState().tracks[trackIndex];
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

  private createClipViewportRect(
    track: Track,
    clip: Clip,
    trackIndex: number,
    clipIndex: number,
    y: number,
    height: number
  ): ClipViewportRect {
    const x = this.context.timeToPixel(clip.timelineStart);
    const endX = this.context.timeToPixel(clip.timelineEnd);

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

  private createTrackViewportRect(
    track: Track,
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

  private createTimelineClipRect(
    track: Track,
    clip: Clip,
    trackIndex: number,
    clipIndex: number,
    rect: ClipViewportRect
  ): TimelineClipRect {
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
}
