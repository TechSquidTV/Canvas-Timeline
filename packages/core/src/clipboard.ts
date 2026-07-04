import { type TimelineEngine, createLeanClip, shiftClipKeyframes } from './engine';
import type { Clip } from './types';
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
          this.clipboard.push({
            clip: createLeanClip(clip),
            originClipId: clip.id,
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

    this.clipboard.forEach(({ clip, originClipId }) => {
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
      this.engine.applyOverwrites(newClip.id);
      this.engine.emit('clip:created', {
        clip: createLeanClip(newClip),
        originClipId,
        reason: 'paste',
      } satisfies ClipCreatedEvent);
    });

    this.engine.invalidateContent();
    this.engine.snapshot();
    this.engine.emit('state:settled');
    this.engine.emit('render');
  }
}
