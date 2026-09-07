import type { TimelineEngine } from '#core/engine';
import {
  createClipGroupSnapshots,
  createMarkerSnapshots,
  createTrackSnapshots,
} from '#core/snapshot';
import type { TimelineState, TimelineStateSnapshot } from '#core/types';
/** Limits retained document history. The current document is always retained. */
export interface TimelineHistoryOptions {
  /** Maximum snapshots, including the current document. Defaults to 100. */
  maxEntries?: number;
  /** Conservative serialized-byte budget. Defaults to 16 MiB. */
  maxBytes?: number;
}

interface HistoryEntry {
  tracks: TimelineStateSnapshot['tracks'];
  markers: TimelineStateSnapshot['markers'];
  clipGroups: TimelineStateSnapshot['clipGroups'];
  bytes: number;
}

export class HistoryManager {
  private history: HistoryEntry[] = [];
  private historyIndex = -1;
  private revision = '';
  private readonly maxEntries: number;
  private readonly maxBytes: number;

  constructor(
    private engine: TimelineEngine,
    private state: TimelineState,
    options: TimelineHistoryOptions = {}
  ) {
    this.maxEntries = options.maxEntries ?? 100;
    this.maxBytes = options.maxBytes ?? 16 * 1024 * 1024;
    if (
      !Number.isSafeInteger(this.maxEntries) ||
      this.maxEntries < 1 ||
      !Number.isSafeInteger(this.maxBytes) ||
      this.maxBytes < 1
    ) {
      throw new RangeError('History limits must be positive safe integers.');
    }
  }

  snapshot(selectionRevision: number) {
    const state = this.state;
    const revision = `${state.contentRevision}:${selectionRevision}`;
    if (this.revision === revision) {
      return;
    }
    this.revision = revision;
    const last = this.history[this.historyIndex];
    const { tracks, markers, clipGroups } = this.engine.getState();
    if (
      last &&
      tracks === last.tracks &&
      markers === last.markers &&
      clipGroups === last.clipGroups
    ) {
      return;
    }
    const entry = { tracks, markers, clipGroups, bytes: 0 };
    // UTF-16 is a conservative charge for JSON content; shared nodes are charged per entry.
    entry.bytes = JSON.stringify(entry).length * 2;
    this.history.splice(this.historyIndex + 1);
    this.history.push(entry);
    let bytes = this.history.reduce((sum, item) => sum + item.bytes, 0);
    while (
      this.history.length > 1 &&
      (this.history.length > this.maxEntries || bytes > this.maxBytes)
    ) {
      bytes -= this.history.shift()?.bytes ?? 0;
    }
    this.historyIndex = this.history.length - 1;
    this.notify();
  }

  undo() {
    if (!this.canUndo) {
      return;
    }
    this.restoreSnapshot(this.history[--this.historyIndex]);
    this.notify();
  }

  redo() {
    if (!this.canRedo) {
      return;
    }
    this.restoreSnapshot(this.history[++this.historyIndex]);
    this.notify();
  }

  get canUndo() {
    return this.historyIndex > 0;
  }
  get canRedo() {
    return this.historyIndex < this.history.length - 1;
  }

  private notify() {
    this.engine.emit('history:change', { index: this.historyIndex, length: this.history.length });
  }
  private restoreSnapshot(snapshot: HistoryEntry) {
    const state = this.state;
    state.tracks = createTrackSnapshots(snapshot.tracks);
    state.markers = createMarkerSnapshots(snapshot.markers);
    state.clipGroups = createClipGroupSnapshots(snapshot.clipGroups);
    this.engine.invalidateContent();
    this.revision = '';
    this.engine.emit('state:settled');
    this.engine.emit('render');
  }
}
