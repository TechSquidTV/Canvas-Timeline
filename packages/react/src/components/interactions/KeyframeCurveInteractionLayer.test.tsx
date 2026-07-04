import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { TimelineEngine, type Clip, type Track } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { TimelineProvider } from '../../Provider';
import { KeyframeCurveInteractionLayer } from './KeyframeCurveInteractionLayer';
import { resetTimelineTapState } from './tapState';

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
let setPointerCaptureSpy: (pointerId: number) => void;

beforeEach(() => {
  resetTimelineTapState();
  setPointerCaptureSpy = vi.fn<(pointerId: number) => void>();
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
  Element.prototype.setPointerCapture = (pointerId: number) => {
    setPointerCaptureSpy(pointerId);
  };
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
        value: 0.25,
        interpolation: 'bezier',
        easing: { x1: 0.2, y1: 0.8, x2: 0.8, y2: 0.2 },
        selected: true,
      },
      {
        id: 'opacity-end',
        property: 'opacity',
        time: fromSeconds(5),
        value: 0.75,
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
  });
}

describe('KeyframeCurveInteractionLayer', () => {
  it('does not handle blank overlay pointer presses', () => {
    const engine = createEngine();
    const startDrag = vi.spyOn(engine, 'startDrag');

    const { container } = render(
      <TimelineProvider engine={engine}>
        <KeyframeCurveInteractionLayer />
      </TimelineProvider>
    );

    const layer = container.querySelector('.timeline-keyframe-curve-interaction-layer') as Element;
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

  it('drags Bezier handles with pointer capture and updates easing', () => {
    const engine = createEngine();

    const { container } = render(
      <TimelineProvider engine={engine}>
        <KeyframeCurveInteractionLayer curveHandleSize={8} />
      </TimelineProvider>
    );

    const segment = engine.getKeyframeCurveSegments({ curveHandleSize: 8 })[0];
    const handle = container.querySelector('[data-handle="incoming"]') as HTMLElement;

    fireEvent.pointerDown(handle, {
      clientX: segment.handles[1].point.x,
      clientY: segment.handles[1].point.y,
      pointerType: 'mouse',
      button: 0,
      pointerId: 1,
    });
    fireEvent.pointerMove(handle, {
      clientX: segment.startPoint.x + (segment.endPoint.x - segment.startPoint.x) * 0.6,
      clientY: segment.startPoint.y + (segment.endPoint.y - segment.startPoint.y) * 0.4,
      pointerType: 'mouse',
      pointerId: 1,
    });
    fireEvent.pointerUp(handle, {
      clientX: segment.startPoint.x + (segment.endPoint.x - segment.startPoint.x) * 0.6,
      clientY: segment.startPoint.y + (segment.endPoint.y - segment.startPoint.y) * 0.4,
      pointerType: 'mouse',
      pointerId: 1,
    });

    expect(setPointerCaptureSpy).toHaveBeenCalledWith(1);
    const updatedEasing = engine.getClipKeyframes('clip-1')[0].easing;
    expect(updatedEasing?.x1).toBe(0.2);
    expect(updatedEasing?.y1).toBe(0.8);
    expect(updatedEasing?.x2).toBeCloseTo(0.6);
    expect(updatedEasing?.y2).toBeCloseTo(0.4);
  });

  it('reports curve handle double-click gestures without built-in policy', () => {
    const engine = createEngine();
    const onCurveHandleDoubleClick = vi.fn();

    const { container } = render(
      <TimelineProvider engine={engine}>
        <KeyframeCurveInteractionLayer onCurveHandleDoubleClick={onCurveHandleDoubleClick} />
      </TimelineProvider>
    );

    const handle = container.querySelector('[data-handle="outgoing"]') as HTMLElement;
    fireEvent.pointerDown(handle, {
      clientX: 180,
      clientY: 44,
      pointerType: 'mouse',
      button: 0,
      pointerId: 1,
      timeStamp: 1000,
    });
    fireEvent.pointerUp(handle, {
      clientX: 180,
      clientY: 44,
      pointerType: 'mouse',
      pointerId: 1,
    });
    fireEvent.pointerDown(handle, {
      clientX: 180,
      clientY: 44,
      pointerType: 'mouse',
      button: 0,
      pointerId: 2,
      timeStamp: 1100,
    });

    expect(onCurveHandleDoubleClick).toHaveBeenCalledTimes(1);
    expect(onCurveHandleDoubleClick).toHaveBeenCalledWith(
      expect.objectContaining({
        clip: expect.objectContaining({ id: 'clip-1' }),
        keyframe: expect.objectContaining({ id: 'opacity-start' }),
        handle: 'outgoing',
      }),
      expect.objectContaining({ engine })
    );
  });
});
