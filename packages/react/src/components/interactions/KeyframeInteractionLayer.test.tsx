import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  createTimelineScalarKeyframeProperty,
  TimelineEngine,
  type Clip,
  type Track,
} from '@techsquidtv/canvas-timeline-core';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { TimelineProvider } from '#react/Provider';
import { KeyframeInteractionLayer } from '#react/components/interactions/KeyframeInteractionLayer';
import { resetTimelineTapState } from '#react/components/interactions/tapState';

function getElementPrototypeMethod<
  K extends 'getBoundingClientRect' | 'setPointerCapture' | 'releasePointerCapture',
>(name: K): Element[K] | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, name);
  return typeof descriptor?.value === 'function' ? (descriptor.value as Element[K]) : undefined;
}

function restoreElementPrototypeMethod<
  K extends 'getBoundingClientRect' | 'setPointerCapture' | 'releasePointerCapture',
>(name: K, method: Element[K] | undefined): void {
  if (method) {
    Element.prototype[name] = method;
    return;
  }
  Reflect.deleteProperty(Element.prototype, name);
}

const originalGetBoundingClientRect = getElementPrototypeMethod('getBoundingClientRect');
const originalSetPointerCapture = getElementPrototypeMethod('setPointerCapture');
const originalReleasePointerCapture = getElementPrototypeMethod('releasePointerCapture');
const opacityKeyframeProperty = createTimelineScalarKeyframeProperty({
  id: 'opacity',
  min: 0,
  max: 1,
  defaultValue: 1,
});

beforeEach(() => {
  resetTimelineTapState();
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    width: 1000,
    height: 200,
    top: 32,
    left: 0,
    bottom: 232,
    right: 1000,
    x: 0,
    y: 32,
    toJSON: () => {},
  }));
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  restoreElementPrototypeMethod('getBoundingClientRect', originalGetBoundingClientRect);
  restoreElementPrototypeMethod('setPointerCapture', originalSetPointerCapture);
  restoreElementPrototypeMethod('releasePointerCapture', originalReleasePointerCapture);
  vi.restoreAllMocks();
});

function createEngine() {
  const clip: Clip = {
    id: 'clip-1',
    sourceId: 'source-clip-1',
    timelineStart: fromSeconds(1),
    timelineEnd: fromSeconds(5),
    sourceStart: fromSeconds(0),
    selected: true,
    keyframes: [
      {
        id: 'opacity-start',
        property: 'opacity',
        time: fromSeconds(1),
        value: 1,
      },
      {
        id: 'opacity-middle',
        property: 'opacity',
        time: fromSeconds(3),
        value: 0.5,
      },
      {
        id: 'opacity-end',
        property: 'opacity',
        time: fromSeconds(5),
        value: 0,
      },
    ],
  };
  const track: Track = {
    id: 'track-1',
    kind: 'visual',
    clips: [clip],
    selected: false,
    locked: false,
    muted: false,
    visible: true,
  };

  return new TimelineEngine({
    tracks: [track],
    playheadTime: fromSeconds(0),
    zoomScale: 100,
    keyframeProperties: [opacityKeyframeProperty],
  });
}

describe('KeyframeInteractionLayer', () => {
  it('does not handle blank overlay pointer presses', () => {
    const engine = createEngine();
    const startDrag = vi.spyOn(engine, 'startDrag');

    const { container } = render(
      <TimelineProvider engine={engine}>
        <KeyframeInteractionLayer property="opacity" selectedClipOnly />
      </TimelineProvider>
    );

    const layer = container.querySelector('.timeline-keyframe-interaction-layer') as Element;
    const allowed = fireEvent.pointerDown(layer, {
      clientX: 50,
      clientY: 40,
      pointerType: 'mouse',
      button: 0,
      pointerId: 1,
    });

    expect(allowed).toBe(true);
    expect(startDrag).not.toHaveBeenCalled();
  });

  it('renders padded hit targets around exact-size keyframe shapes', () => {
    const engine = createEngine();

    const { container } = render(
      <TimelineProvider engine={engine}>
        <KeyframeInteractionLayer
          property="opacity"
          selectedClipOnly
          keyframeSize={6}
          hitPadding={9}
        />
      </TimelineProvider>
    );

    const rect = engine
      .getKeyframeRects({ keyframeSize: 6 })
      .find((entry) => entry.keyframe.id === 'opacity-middle')?.rect;
    const handle = container.querySelector('[data-keyframe-id="opacity-middle"]') as HTMLElement;
    const shape = handle.querySelector('.timeline-keyframe-handle-shape') as HTMLElement;

    expect(rect).toBeDefined();
    expect(handle.style.width).toBe(`${(rect?.width ?? 0) + 18}px`);
    expect(handle.style.height).toBe(`${(rect?.height ?? 0) + 18}px`);
    expect(handle.style.transform).toContain(`translate(${(rect?.x ?? 0) - 9}px,`);
    expect(handle.style.transform).not.toContain('rotate');
    expect(shape.style.width).toBe(`${rect?.width ?? 0}px`);
    expect(shape.style.height).toBe(`${rect?.height ?? 0}px`);
  });

  it('drags a clamped edge keyframe from its actual timeline time', () => {
    const engine = createEngine();

    const { container } = render(
      <TimelineProvider engine={engine}>
        <KeyframeInteractionLayer property="opacity" selectedClipOnly keyframeSize={12} />
      </TimelineProvider>
    );

    const handle = container.querySelector('[data-keyframe-id="opacity-start"]') as HTMLElement;

    fireEvent.pointerDown(handle, {
      clientX: 100,
      clientY: 40,
      pointerType: 'mouse',
      button: 0,
      pointerId: 1,
    });
    fireEvent.pointerMove(document, {
      clientX: 200,
      clientY: 40,
      pointerType: 'mouse',
      pointerId: 1,
    });
    fireEvent.pointerUp(document, {
      clientX: 200,
      clientY: 40,
      pointerType: 'mouse',
      pointerId: 1,
    });

    const keyframes = engine.getClipKeyframes('clip-1') as Array<{
      id: string;
      time: { v: number; r: number };
    }>;
    const keyframe = keyframes.find((candidate) => candidate.id === 'opacity-start');
    expect(keyframe ? toSeconds(keyframe.time) : null).toBe(2);
  });

  it('reports keyframe double-click gestures', () => {
    const engine = createEngine();
    const onKeyframeDoubleClick = vi.fn();

    const { container } = render(
      <TimelineProvider engine={engine}>
        <KeyframeInteractionLayer
          property="opacity"
          selectedClipOnly
          onKeyframeDoubleClick={onKeyframeDoubleClick}
        />
      </TimelineProvider>
    );

    const handle = container.querySelector('[data-keyframe-id="opacity-middle"]') as HTMLElement;
    fireEvent.pointerDown(handle, {
      clientX: 300,
      clientY: 56,
      pointerType: 'mouse',
      button: 0,
      pointerId: 1,
      timeStamp: 1000,
    });
    fireEvent.pointerUp(handle, {
      clientX: 300,
      clientY: 56,
      pointerType: 'mouse',
      pointerId: 1,
    });
    fireEvent.pointerDown(handle, {
      clientX: 300,
      clientY: 56,
      pointerType: 'mouse',
      button: 0,
      pointerId: 2,
      timeStamp: 1100,
    });

    expect(onKeyframeDoubleClick).toHaveBeenCalledTimes(1);
    expect(onKeyframeDoubleClick).toHaveBeenCalledWith(
      expect.objectContaining({
        clip: expect.objectContaining({ id: 'clip-1' }),
        keyframe: expect.objectContaining({ id: 'opacity-middle' }),
      }),
      expect.objectContaining({ engine })
    );
  });

  it('leaves keyboard delete policy to the caller', () => {
    const engine = createEngine();

    const { container, rerender } = render(
      <TimelineProvider engine={engine}>
        <KeyframeInteractionLayer property="opacity" selectedClipOnly />
      </TimelineProvider>
    );

    const handle = container.querySelector('[data-keyframe-id="opacity-middle"]') as HTMLElement;
    fireEvent.keyDown(handle, { key: 'Delete' });

    expect(engine.getClipKeyframes('clip-1')).toHaveLength(3);

    const onKeyframeDelete = vi.fn();
    rerender(
      <TimelineProvider engine={engine}>
        <KeyframeInteractionLayer
          property="opacity"
          selectedClipOnly
          onKeyframeDelete={onKeyframeDelete}
        />
      </TimelineProvider>
    );

    const nextHandle = container.querySelector(
      '[data-keyframe-id="opacity-middle"]'
    ) as HTMLElement;
    fireEvent.keyDown(nextHandle, { key: 'Backspace' });

    expect(engine.getClipKeyframes('clip-1')).toHaveLength(3);
    expect(onKeyframeDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        clip: expect.objectContaining({ id: 'clip-1' }),
        keyframe: expect.objectContaining({ id: 'opacity-middle' }),
      }),
      expect.objectContaining({ engine })
    );
  });
});
