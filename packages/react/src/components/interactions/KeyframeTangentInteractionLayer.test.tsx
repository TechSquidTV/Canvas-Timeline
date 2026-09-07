import { KeyframeTangentInteractionLayer } from '#react/components/interactions/KeyframeTangentInteractionLayer';
import {
  createKeyframeInteractionEngine,
  installKeyframePointerMocks,
  pointer,
  renderKeyframeLayer,
} from '#react/hooks/integration/keyframeInteractionTestHelpers';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';

installKeyframePointerMocks();
function setup() {
  const engine = createKeyframeInteractionEngine([
    {
      id: 'a',
      property: 'opacity',
      time: fromSeconds(1),
      value: 0.5,
      selected: true,
      outgoing: { interpolation: 'bezier', handle: { x: 0.3, y: 0.8 } },
    },
    {
      id: 'b',
      property: 'opacity',
      time: fromSeconds(5),
      value: 0.5,
      selected: true,
      incoming: { interpolation: 'bezier', handle: { x: 0.7, y: 0.8 } },
    },
  ]);
  const view = renderKeyframeLayer(engine, <KeyframeTangentInteractionLayer property="opacity" />);
  const handle = engine.keyframes.getKeyframeSegments({ property: 'opacity' })[0].handles[1];
  return { ...view, engine, handle, layer: view.getByRole('group') };
}

describe('delegated tangent editing', () => {
  it('renders one focus handle while hit-testing every visible selected tangent', () => {
    const { container, stage, engine, handle, layer } = setup();
    expect(container.querySelectorAll('.timeline-keyframe-tangent-handle')).toHaveLength(1);
    fireEvent.pointerDown(stage, pointer(handle.point.x + 4, handle.point.y + 3));
    fireEvent.pointerMove(layer, pointer(handle.point.x + 4, handle.point.y + 3 + 10));
    const before = engine.getState().tracks[0].clips[0].keyframes?.[1].incoming?.handle?.y;
    expect(before).toBe(0.8);
    expect(engine.keyframes.getClipKeyframes('clip')[1].incoming?.handle?.y).toBeCloseTo(
      0.8 - 10 / 34
    );
    fireEvent.pointerUp(layer, pointer(handle.point.x + 4, handle.point.y + 13));
    engine.undo();
    expect(engine.keyframes.getClipKeyframes('clip')[1].incoming?.handle?.y).toBe(0.8);
  });

  it('cancels flat-segment tangent edits and supports keyboard values', () => {
    const { stage, engine, handle, layer } = setup();
    fireEvent.pointerDown(stage, pointer(handle.point.x, handle.point.y));
    fireEvent.pointerMove(layer, pointer(handle.point.x, handle.point.y + 15));
    fireEvent.keyDown(layer, { key: 'Escape' });
    expect(engine.keyframes.getClipKeyframes('clip')[1].incoming?.handle?.y).toBe(0.8);
    expect(engine.canUndo).toBe(false);
    fireEvent.keyDown(layer, { key: 'ArrowUp' });
    expect(engine.keyframes.getClipKeyframes('clip')[1].incoming?.handle?.y).toBeCloseTo(0.81);
  });

  it('uses document fallback only when capture is unavailable and cleans it up', () => {
    const { stage, engine, handle } = setup();
    vi.spyOn(Element.prototype, 'setPointerCapture').mockImplementation(() => {
      throw new Error('No capture');
    });
    const remove = vi.spyOn(document, 'removeEventListener');
    fireEvent.pointerDown(stage, pointer(handle.point.x, handle.point.y));
    fireEvent.pointerMove(document, pointer(handle.point.x + 20, handle.point.y));
    fireEvent.pointerUp(document, pointer(handle.point.x + 20, handle.point.y));
    expect(engine.keyframes.getClipKeyframes('clip')[1].incoming?.handle?.x).toBeGreaterThan(0.7);
    expect(remove.mock.calls.filter((call) => call[0] === 'pointermove')).toHaveLength(1);
  });
});
