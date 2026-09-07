import type { TimelineEngine } from '#core/engine';
import { createClipSnapshot } from '#core/snapshot';
import type { Clip, TimelineEditCommand } from '#core/types';
import { addRational, compareRational, subRational } from '@techsquidtv/canvas-timeline-utils';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
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
            clip: createClipSnapshot(clip),
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
    return this.engine.commitEdit({
      type: 'delete-clips',
      reason: 'cut',
      clipIds: this.clipboard.map(({ clip }) => clip.id),
    });
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

    const placements = this.clipboard.map(({ clip, originClipId }) => ({
      originClipId,
      clip: createClipSnapshot(clip, { id: crypto.randomUUID(), selected: false }),
      targetTrackId: destTrackId,
      startTime: addRational(time, subRational(clip.timelineStart, earliestStart)),
    }));
    const commands: TimelineEditCommand[] = [];
    const groups = new Map<string, { label?: string; placements: typeof placements }>();
    for (const [index, entry] of this.clipboard.entries()) {
      const placement = placements[index];
      if (entry.originGroupId) {
        const group = groups.get(entry.originGroupId) ?? {
          label: entry.originGroupLabel,
          placements: [],
        };
        group.placements.push(placement);
        groups.set(entry.originGroupId, group);
      } else {
        commands.push({ type: 'overwrite', ...placement, snap: false });
      }
    }
    for (const group of groups.values()) {
      if (group.placements.length > 1) {
        commands.push({ type: 'overwrite-clip-group', ...group, snap: false });
      } else {
        commands.push({ type: 'overwrite', ...group.placements[0], snap: false });
      }
    }
    return this.engine.commitEdits(commands);
  }
}
