import type { TimelineEngine } from '#core/engine';
import { createClipSnapshot } from '#core/model-clone';
import type { Clip, TimelineEditCommand } from '#core/types';
import { addRational, compareRational, subRational } from '@techsquidtv/canvas-timeline-utils';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
export type ClipboardEntry = {
  clip: Clip;
  originClipId: string;
  sourceTrackId: string;
  sourceTrackIndex: number;
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
    for (const [sourceTrackIndex, track] of state.tracks.entries()) {
      for (const clip of track.clips) {
        if (clip.selected) {
          const group = this.engine.getClipGroupForClip(clip.id);
          this.clipboard.push({
            clip: createClipSnapshot(clip),
            originClipId: clip.id,
            sourceTrackId: track.id,
            sourceTrackIndex,
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

    const first = this.clipboard[0];
    const multipleTracks = this.clipboard.some(
      (entry) => entry.sourceTrackId !== first.sourceTrackId
    );
    const anchorId = targetTrackId ?? state.tracks.find((track) => track.targeted)?.id;
    const anchorIndex =
      anchorId === undefined ? 0 : state.tracks.findIndex((track) => track.id === anchorId);
    if (anchorIndex < 0) {
      return;
    }
    const sourceTrackIds = new Set(state.tracks.map((track) => track.id));
    const destinationIds: string[] = [];
    for (const entry of this.clipboard) {
      const destinationId =
        multipleTracks && anchorId === undefined
          ? entry.sourceTrackId
          : state.tracks[anchorIndex + entry.sourceTrackIndex - first.sourceTrackIndex]?.id;
      if (destinationId === undefined || !sourceTrackIds.has(destinationId)) {
        return;
      }
      destinationIds.push(destinationId);
    }

    // Find the earliest start time in clipboard to maintain relative offsets
    const earliestStart = this.clipboard.reduce(
      (acc, { clip }) => (compareRational(clip.timelineStart, acc) < 0 ? clip.timelineStart : acc),
      this.clipboard[0].clip.timelineStart
    );

    const placements = this.clipboard.map(({ clip, originClipId }, index) => ({
      originClipId,
      clip: createClipSnapshot(clip, { id: crypto.randomUUID(), selected: false }),
      targetTrackId: destinationIds[index],
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
