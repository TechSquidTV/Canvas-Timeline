import { KeyframeInteractionLayer } from '#react/components/interactions/KeyframeInteractionLayer';
import { resetTimelineTapState } from '#react/components/interactions/tapState';
import {
  createKeyframeInteractionEngine,
  installKeyframePointerMocks,
  pointer,
  renderKeyframeLayer,
} from '#react/hooks/integration/keyframeInteractionTestHelpers';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

installKeyframePointerMocks();
beforeEach(resetTimelineTapState);

describe('delegated keyframe editing', () => {
  it('passes blank presses through and keeps a constant DOM size for dense timelines', () => {
    const engine = createKeyframeInteractionEngine(
      Array.from({ length: 5000 }, (_, index) => ({
        id: `key-${index}`,
        property: 'opacity',
        time: fromSeconds(1 + (index * 4) / 5000),
        value: 0.5,
      }))
    );
    const preview = vi.spyOn(engine, 'previewEdit');
    const { container, stage } = renderKeyframeLayer(
      engine,
      <KeyframeInteractionLayer property="opacity" />
    );
    expect(container.querySelectorAll('.timeline-keyframe-handle')).toHaveLength(1);
    fireEvent.pointerDown(stage, pointer(20, 150));
    expect(preview).not.toHaveBeenCalled();
    expect(engine.keyframes.getSelectedKeyframes()).toEqual([]);
  });

  it('preserves both grab offsets, updates once per event, and caches bounds during dragging', () => {
    const engine = createKeyframeInteractionEngine();
    const { stage, getByRole } = renderKeyframeLayer(
      engine,
      <KeyframeInteractionLayer property="opacity" hitPadding={10} />
    );
    const layer = getByRole('group');
    const rect = engine.keyframes.getKeyframeRects()[0].rect;
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2 + 5;
    const preview = vi.spyOn(engine, 'previewEdit');
    fireEvent.pointerDown(stage, pointer(x, y));
    const bounds = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    bounds.mockClear();
    fireEvent.pointerMove(layer, pointer(x + 100, y));
    expect(preview).toHaveBeenCalledTimes(1);
    expect(bounds).not.toHaveBeenCalled();
    expect(engine.keyframes.getClipKeyframes('clip')[0].value).toBe(1);
    expect(toSeconds(engine.keyframes.getClipKeyframes('clip')[0].time)).toBe(2);
    expect(
      toSeconds(engine.getState().tracks[0].clips[0].keyframes?.[0].time ?? fromSeconds(0))
    ).toBe(1);
    fireEvent.pointerUp(layer, pointer(x + 100, y));
    expect(
      toSeconds(engine.getState().tracks[0].clips[0].keyframes?.[0].time ?? fromSeconds(0))
    ).toBe(2);
    engine.undo();
    expect(toSeconds(engine.keyframes.getClipKeyframes('clip')[0].time)).toBe(1);
    expect(engine.canUndo).toBe(false);
  });

  it.each(['pointerCancel', 'lostPointerCapture', 'Escape'] as const)(
    'rolls back on %s and ignores unrelated pointers',
    (ending) => {
      const engine = createKeyframeInteractionEngine();
      const { stage, getByRole } = renderKeyframeLayer(
        engine,
        <KeyframeInteractionLayer property="opacity" />
      );
      const layer = getByRole('group');
      fireEvent.pointerDown(stage, pointer(300, 56));
      fireEvent.pointerMove(layer, pointer(340, 50, 2));
      expect(toSeconds(engine.keyframes.getClipKeyframes('clip')[1].time)).toBe(3);
      fireEvent.pointerMove(layer, pointer(340, 50));
      expect(toSeconds(engine.keyframes.getClipKeyframes('clip')[1].time)).toBeGreaterThan(3);
      if (ending === 'Escape') {
        fireEvent.keyDown(layer, { key: 'Escape' });
      } else {
        fireEvent[ending](layer, pointer(340, 50));
      }
      expect(toSeconds(engine.keyframes.getClipKeyframes('clip')[1].time)).toBe(3);
      expect(engine.canUndo).toBe(false);
    }
  );

  it('supports marquee selection, additive clicks, group movement and frame-aware keyboard nudges', () => {
    const engine = createKeyframeInteractionEngine();
    const { stage, getByRole } = renderKeyframeLayer(
      engine,
      <KeyframeInteractionLayer property="opacity" />
    );
    const layer = getByRole('group');
    fireEvent.pointerDown(stage, { ...pointer(80, 85), shiftKey: true });
    fireEvent.pointerMove(layer, pointer(330, 30));
    fireEvent.pointerUp(layer, pointer(330, 30));
    expect(engine.keyframes.getSelectedKeyframes().map((ref) => ref.keyframeId)).toEqual([
      'a',
      'b',
    ]);
    fireEvent.pointerDown(stage, pointer(300, 56));
    fireEvent.pointerMove(layer, { ...pointer(325, 56), shiftKey: true });
    fireEvent.pointerUp(layer, pointer(325, 56));
    expect(
      engine.keyframes
        .getClipKeyframes('clip')
        .slice(0, 2)
        .map((key) => toSeconds(key.time))
    ).toEqual([1.25, 3.25]);
    fireEvent.keyDown(layer, { key: 'ArrowRight' });
    expect(toSeconds(engine.keyframes.getClipKeyframes('clip')[0].time)).toBeCloseTo(
      1.25 + 1 / 24,
      4
    );
    fireEvent.keyDown(layer, { key: 'ArrowDown' });
    expect(engine.keyframes.getClipKeyframes('clip')[1].value).toBeCloseTo(0.49);
    fireEvent.keyDown(layer, { key: 'Delete' });
    expect(engine.keyframes.getClipKeyframes('clip').map((key) => key.id)).toEqual(['c']);
    engine.undo();
    expect(engine.keyframes.getClipKeyframes('clip')).toHaveLength(3);
  });

  it('keeps double-click policy customizable and focuses the keyboard surface', () => {
    const engine = createKeyframeInteractionEngine();
    const doubleClick = vi.fn();
    const { stage, getByRole } = renderKeyframeLayer(
      engine,
      <KeyframeInteractionLayer property="opacity" onKeyframeDoubleClick={doubleClick} />
    );
    fireEvent.pointerDown(stage, pointer(300, 56));
    fireEvent.pointerUp(getByRole('group'), pointer(300, 56));
    fireEvent.pointerDown(stage, pointer(300, 56));
    expect(doubleClick).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(getByRole('group'));
    expect(getByRole('group').getAttribute('aria-label')).toContain('0.5');
  });
});

it.each(['shiftKey', 'ctrlKey', 'metaKey'] as const)(
  'supports %s held before dragging a selected key',
  (modifier) => {
    const engine = createKeyframeInteractionEngine();
    engine.keyframes.selectKeyframes([{ clipId: 'clip', keyframeId: 'b' }]);
    const { stage, getByRole } = renderKeyframeLayer(
      engine,
      <KeyframeInteractionLayer property="opacity" />
    );
    const layer = getByRole('group');
    fireEvent.pointerDown(stage, { ...pointer(300, 56), [modifier]: true });
    fireEvent.pointerMove(layer, { ...pointer(323, 52), [modifier]: true });
    fireEvent.pointerUp(layer, { ...pointer(323, 52), [modifier]: true });
    const key = engine.keyframes.getClipKeyframes('clip')[1];
    expect(key.selected).toBe(true);
    expect(toSeconds(key.time)).toBeCloseTo(modifier === 'shiftKey' ? 3.25 : 3.23, 5);
    if (modifier === 'shiftKey') {
      expect(key.value).toBe(0.5);
    }
    expect(engine.canUndo).toBe(true);
  }
);

it('toggles a selected key on modifier click without committing pointer jitter', () => {
  const engine = createKeyframeInteractionEngine();
  engine.keyframes.selectKeyframes([{ clipId: 'clip', keyframeId: 'b' }]);
  const { stage, getByRole } = renderKeyframeLayer(
    engine,
    <KeyframeInteractionLayer property="opacity" />
  );
  const layer = getByRole('group');
  fireEvent.pointerDown(stage, { ...pointer(300, 56), shiftKey: true });
  fireEvent.pointerMove(layer, { ...pointer(301, 57), shiftKey: true });
  fireEvent.pointerUp(layer, { ...pointer(301, 57), shiftKey: true });
  expect(engine.keyframes.getSelectedKeyframes()).toEqual([]);
  expect(engine.keyframes.getClipKeyframes('clip')[1].time).toEqual(fromSeconds(3));
  expect(engine.canUndo).toBe(false);
});
