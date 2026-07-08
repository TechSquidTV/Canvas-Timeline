import type { TimelineEngine } from '#core/engine';
import {
  createClipGroupSnapshots,
  createMarkerSnapshots,
  createTrackSnapshots,
  stringifyTrackSnapshots,
} from '#core/snapshot';

export class HistoryManager {
  private engine: TimelineEngine;
  private history: { tracks: string; markers: string; clipGroups: string }[] = [];
  private historyIndex: number = -1;

  constructor(engine: TimelineEngine) {
    this.engine = engine;
  }

  snapshot() {
    const state = this.engine.getState();
    const tracksStr = stringifyTrackSnapshots(state.tracks);
    const markersStr = JSON.stringify(state.markers ?? []);
    const clipGroupsStr = JSON.stringify(createClipGroupSnapshots(state.clipGroups));

    const last = this.history[this.historyIndex];
    if (
      last !== undefined &&
      last.tracks === tracksStr &&
      last.markers === markersStr &&
      last.clipGroups === clipGroupsStr
    ) {
      return;
    }

    // Truncate future history if we're not at the end
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    // Save stringified clone to avoid deep cloning complex objects manually
    this.history.push({
      tracks: tracksStr,
      markers: markersStr,
      clipGroups: clipGroupsStr,
    });

    this.historyIndex = this.history.length - 1;
    this.engine.emit('history:change', { index: this.historyIndex, length: this.history.length });
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.restoreSnapshot(this.history[this.historyIndex]);
      this.engine.emit('history:change', { index: this.historyIndex, length: this.history.length });
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.restoreSnapshot(this.history[this.historyIndex]);
      this.engine.emit('history:change', { index: this.historyIndex, length: this.history.length });
    }
  }

  get canUndo() {
    return this.historyIndex > 0;
  }

  get canRedo() {
    return this.historyIndex < this.history.length - 1;
  }

  private restoreSnapshot(snapshot: { tracks: string; markers: string; clipGroups: string }) {
    const state = this.engine.getState();
    state.tracks = createTrackSnapshots(JSON.parse(snapshot.tracks));
    state.markers = createMarkerSnapshots(JSON.parse(snapshot.markers));
    state.clipGroups = createClipGroupSnapshots(JSON.parse(snapshot.clipGroups));
    this.engine.invalidateContent();
    this.engine.emit('state:settled');
    this.engine.emit('render');
  }
}
