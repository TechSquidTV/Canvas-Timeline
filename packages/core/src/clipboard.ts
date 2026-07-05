import { type TimelineEngine, createLeanClip, shiftClipKeyframes } from './engine';
import type { Clip, TimelineState } from './types';
import type { ClipCreatedEvent, ClipRemovedEvent } from './events';
import {
  addRational,
  compareRational,
  subRational,
  type RationalTime,
} from '@techsquidtv/canvas-timeline-utils';

export type ClipboardEntry = {
  clip: Clip;
  originClipId: string;
  originGroupId?: string;
  originGroupLabel?: string;
};

export class ClipboardManager {
  private engine: TimelineEngine;
  private clipboard: ClipboardEntry[] = [];

  constructor(engine: TimelineEngine) {
    this.engine = engine;
  }

  /**
   * Number of clips currently stored in the clipboard.
   */
  get count() {
    return this.clipboard.length;
  }

  /**
   * Whether the clipboard currently contains clips that can be pasted.
   */
  get canPaste() {
    return this.clipboard.length > 0;
  }

  copySelection() {
    this.clipboard = [];
    const state = this.engine.getState();
    for (const track of state.tracks) {
      for (const clip of track.clips) {
        if (clip.selected) {
          const group = this.engine.getClipGroupForClip(clip.id);
          this.clipboard.push({
            clip: createLeanClip(clip),
            originClipId: clip.id,
            ...(group !== undefined ? { originGroupId: group.id } : {}),
            ...(group?.label !== undefined ? { originGroupLabel: group.label } : {}),
          });
        }
      }
    }
    this.engine.emit('clipboard:change');
  }

  cutSelection() {
    this.copySelection();
    const state = this.engine.getState();
    const removedClips: Clip[] = [];
    for (const track of state.tracks) {
      track.clips = track.clips.filter((clip) => {
        if (clip.selected) {
          removedClips.push(createLeanClip(clip));
          return false;
        }
        return true;
      });
    }
    cleanupClipGroups(state);
    for (const clip of removedClips) {
      this.engine.emit('clip:removed', {
        clip,
        reason: 'cut',
      } satisfies ClipRemovedEvent);
    }
    this.engine.snapshot();
    this.engine.invalidateContent();
    this.engine.emit('state:settled');
    this.engine.emit('render');
  }

  pasteSelection(time: RationalTime, targetTrackId?: string) {
    if (this.clipboard.length === 0) {
      return;
    }

    const state = this.engine.getState();

    // If no target given, try to use first targeted track or first video track
    const destTrackId =
      targetTrackId ?? state.tracks.find((t) => t.targeted)?.id ?? state.tracks[0]?.id;

    if (!destTrackId) {
      return;
    }
    const track = state.tracks.find((t) => t.id === destTrackId);
    if (!track) {
      return;
    }

    // Find the earliest start time in clipboard to maintain relative offsets
    const earliestStart = this.clipboard.reduce(
      (acc, { clip }) => (compareRational(clip.timelineStart, acc) < 0 ? clip.timelineStart : acc),
      this.clipboard[0].clip.timelineStart
    );

    const pastedGroupClipIds = new Map<string, { clipIds: string[]; label?: string }>();

    this.clipboard.forEach(({ clip, originClipId, originGroupId, originGroupLabel }) => {
      const offset = subRational(clip.timelineStart, earliestStart);
      const duration = subRational(clip.timelineEnd, clip.timelineStart);
      const newClip = createLeanClip(clip, {
        id: crypto.randomUUID(),
        timelineStart: addRational(time, offset),
        timelineEnd: addRational(addRational(time, offset), duration),
        selected: false,
      });
      shiftClipKeyframes(newClip, subRational(newClip.timelineStart, clip.timelineStart));
      track.clips.push(newClip);
      if (originGroupId !== undefined) {
        const group = pastedGroupClipIds.get(originGroupId) ?? { clipIds: [] };
        group.clipIds.push(newClip.id);
        if (originGroupLabel !== undefined) {
          group.label = originGroupLabel;
        }
        pastedGroupClipIds.set(originGroupId, group);
      }
      this.engine.applyOverwrites(newClip.id);
      this.engine.emit('clip:created', {
        clip: createLeanClip(newClip),
        originClipId,
        reason: 'paste',
      } satisfies ClipCreatedEvent);
    });

    for (const group of pastedGroupClipIds.values()) {
      if (group.clipIds.length >= 2) {
        state.clipGroups.push({
          id: crypto.randomUUID(),
          clipIds: group.clipIds,
          ...(group.label !== undefined ? { label: group.label } : {}),
        });
      }
    }
    cleanupClipGroups(state);

    this.engine.invalidateContent();
    this.engine.snapshot();
    this.engine.emit('state:settled');
    this.engine.emit('render');
  }
}

function cleanupClipGroups(state: TimelineState) {
  const existingClipIds = new Set<string>();
  for (const track of state.tracks) {
    for (const clip of track.clips) {
      existingClipIds.add(clip.id);
    }
  }

  const claimedClipIds = new Set<string>();
  state.clipGroups = state.clipGroups.flatMap((group) => {
    const clipIds = group.clipIds.filter((clipId) => {
      if (!existingClipIds.has(clipId) || claimedClipIds.has(clipId)) {
        return false;
      }
      claimedClipIds.add(clipId);
      return true;
    });
    return clipIds.length >= 2
      ? [{ id: group.id, clipIds, ...(group.label !== undefined ? { label: group.label } : {}) }]
      : [];
  });
}
