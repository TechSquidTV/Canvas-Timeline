import { TimelineEngine } from '#core/engine';
import type { Track } from '#core/types';
import { describe, expect, it, vi } from 'vite-plus/test';

function track(id: string): Track {
  return {
    id,
    name: id,
    kind: 'visual',
    height: 100,
    clips: [],
    selected: false,
    locked: false,
    muted: false,
    visible: true,
  };
}

function createEngine() {
  const engine = new TimelineEngine({ tracks: [track('a'), track('b'), track('c')] });
  engine.setViewportHeight(100);
  return engine;
}

describe('track organization commands', () => {
  it('renames, reorders in both directions, and collapses with one undo step per change', () => {
    const engine = createEngine();
    expect(engine.renameTrack('a', 'Dialogue').ok).toBe(true);
    expect(engine.moveTrack('a', 2).ok).toBe(true);
    expect(engine.tracks.map(({ id }) => id)).toEqual(['b', 'c', 'a']);
    expect(engine.moveTrack('a', 0).ok).toBe(true);
    expect(engine.tracks.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
    expect(engine.setTrackCollapsed('a', true).ok).toBe(true);
    expect(engine.tracks[0]).toMatchObject({ collapsed: true, height: 100, visible: true });
    engine.undo();
    expect(engine.tracks[0]?.collapsed).not.toBe(true);
    engine.undo();
    expect(engine.tracks.map(({ id }) => id)).toEqual(['b', 'c', 'a']);
    engine.undo();
    expect(engine.tracks.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
    engine.undo();
    expect(engine.tracks[0]?.name).toBe('a');
    engine.redo();
    expect(engine.tracks[0]?.name).toBe('Dialogue');
    engine.renameTrack('a', undefined);
    expect(engine.tracks[0]?.name).toBeUndefined();
  });

  it('rejects missing rows and invalid indices without changing state or history', () => {
    const engine = createEngine();
    const before = engine.getState();
    for (const index of [-1, 3, 0.5, NaN, Infinity]) {
      expect(engine.moveTrack('a', index)).toMatchObject({ ok: false, reason: 'invalid-input' });
    }
    expect(engine.renameTrack('missing', 'Name')).toMatchObject({ reason: 'not-found' });
    expect(engine.moveTrack('missing', 0)).toMatchObject({ reason: 'not-found' });
    expect(engine.setTrackCollapsed('missing', true)).toMatchObject({ reason: 'not-found' });
    expect(engine.getState()).toBe(before);
    expect(engine.canUndo).toBe(false);
  });

  it('avoids notifications and history entries for unchanged values', () => {
    const engine = createEngine();
    const changed = vi.fn();
    engine.on('content:change', changed);
    engine.renameTrack('a', 'a');
    engine.moveTrack('a', 0);
    engine.setTrackCollapsed('a', false);
    expect(changed).not.toHaveBeenCalled();
    expect(engine.canUndo).toBe(false);
  });

  it('clamps vertical scroll and publishes updated row geometry after collapse', () => {
    const engine = createEngine();
    engine.setScrollTop(engine.maxScrollTop);
    const previous = engine.scrollTop;
    const scroll = vi.fn();
    engine.on('scroll:change', scroll);
    engine.setTrackCollapsed('c', true);
    expect(engine.scrollTop).toBeLessThan(previous);
    expect(engine.scrollTop).toBe(engine.maxScrollTop);
    expect(scroll).toHaveBeenCalledOnce();
    expect(engine.geometry.getTrackRects().find((rect) => rect.trackId === 'c')?.height).toBe(24);
  });
});
