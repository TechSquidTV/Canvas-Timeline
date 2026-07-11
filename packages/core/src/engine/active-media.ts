import type {
  ActiveClip,
  ActiveClipQuery,
  ActiveLayerSelector,
  ActiveLayerOptions,
  ActiveLayerResult,
  Clip,
  ClipSourceRange,
  Track,
} from '#core/types';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { compareRational } from '@techsquidtv/canvas-timeline-utils';
import {
  createClipSourceRange,
  createClipSyncKey,
  mapSourceTimeToTimelineTime,
  mapTimelineTimeToSourceTime,
} from '#core/engine/media-sync';
import { TimelineEngineKeyframes } from '#core/engine/keyframes';

export abstract class TimelineEngineMedia extends TimelineEngineKeyframes {
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
}
