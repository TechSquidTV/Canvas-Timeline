import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  createTimelineScalarKeyframeProperty,
  TimelineEngine,
  type Clip,
  type Track,
} from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { TimelineProvider } from '../../Provider';
import { KeyframeTangentInteractionLayer } from './KeyframeTangentInteractionLayer';
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
const opacityKeyframeProperty = createTimelineScalarKeyframeProperty({
  id: 'opacity',
  min: 0,
  max: 1,
  defaultValue: 1,
});
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
        outgoing: { interpolation: 'bezier', handle: { x: 0.2, y: 0.8 } },
        selected: true,
      },
      {
        id: 'opacity-end',
        property: 'opacity',
        time: fromSeconds(5),
        value: 0.75,
        incoming: { interpolation: 'bezier', handle: { x: 0.8, y: 0.2 } },
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

describe('KeyframeTangentInteractionLayer', () => {
  it('does not handle blank overlay pointer presses', () => {
    const engine = createEngine();
    const startDrag = vi.spyOn(engine, 'startDrag');

    const { container } = render(
      <TimelineProvider engine={engine}>
        <KeyframeTangentInteractionLayer property="opacity" />
      </TimelineProvider>
    );

    const layer = container.querySelector(
      '.timeline-keyframe-tangent-interaction-layer'
    ) as Element;
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

  it('drags Bezier handles with pointer capture and updates the incoming side', () => {
    const engine = createEngine();

    const { container } = render(
      <TimelineProvider engine={engine}>
        <KeyframeTangentInteractionLayer property="opacity" tangentHandleSize={8} />
      </TimelineProvider>
    );

    const segment = engine.getKeyframeSegments({ property: 'opacity', tangentHandleSize: 8 })[0];
    const handle = container.querySelector('[data-side="incoming"]') as HTMLElement;

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
    const updatedIncoming = engine.getClipKeyframes('clip-1')[1].incoming?.handle;
    expect(engine.getClipKeyframes('clip-1')[0].outgoing?.handle).toEqual({ x: 0.2, y: 0.8 });
    expect(updatedIncoming?.x).toBeCloseTo(0.6);
    expect(updatedIncoming?.y).toBeCloseTo(0.4);
  });

  it('renders padded hit targets around exact-size handle shapes', () => {
    const engine = createEngine();

    const { container } = render(
      <TimelineProvider engine={engine}>
        <KeyframeTangentInteractionLayer property="opacity" tangentHandleSize={8} hitPadding={10} />
      </TimelineProvider>
    );

    const segment = engine.getKeyframeSegments({ property: 'opacity', tangentHandleSize: 8 })[0];
    const handle = container.querySelector('[data-side="outgoing"]') as HTMLElement;
    const shape = handle.querySelector('.timeline-keyframe-tangent-handle-shape') as HTMLElement;
    const rect = segment.handles[0].rect;

    expect(handle.style.width).toBe(`${rect.width + 20}px`);
    expect(handle.style.height).toBe(`${rect.height + 20}px`);
    expect(handle.style.transform).toContain(`translate(${rect.x - 10}px,`);
    expect(shape.style.width).toBe(`${rect.width}px`);
    expect(shape.style.height).toBe(`${rect.height}px`);
  });

  it('selects the anchor keyframe when a handle drag starts', () => {
    const engine = createEngine();

    const { container } = render(
      <TimelineProvider engine={engine}>
        <KeyframeTangentInteractionLayer property="opacity" />
      </TimelineProvider>
    );

    const handle = container.querySelector('[data-side="incoming"]') as HTMLElement;
    fireEvent.pointerDown(handle, {
      clientX: 200,
      clientY: 60,
      pointerType: 'mouse',
      button: 0,
      pointerId: 1,
    });

    const keyframes = engine.getClipKeyframes('clip-1');
    expect(keyframes.find((keyframe) => keyframe.id === 'opacity-end')?.selected).toBe(true);
    expect(keyframes.find((keyframe) => keyframe.id === 'opacity-start')?.selected).toBe(false);

    fireEvent.pointerUp(handle, { pointerType: 'mouse', pointerId: 1 });
  });

  it('keeps dragging through document listeners when pointer capture is unavailable', () => {
    const engine = createEngine();
    Element.prototype.setPointerCapture = () => {
      throw new Error('capture unavailable');
    };

    const { container } = render(
      <TimelineProvider engine={engine}>
        <KeyframeTangentInteractionLayer property="opacity" tangentHandleSize={8} />
      </TimelineProvider>
    );

    const segment = engine.getKeyframeSegments({ property: 'opacity', tangentHandleSize: 8 })[0];
    const handle = container.querySelector('[data-side="incoming"]') as HTMLElement;

    fireEvent.pointerDown(handle, {
      clientX: segment.handles[1].point.x,
      clientY: segment.handles[1].point.y,
      pointerType: 'mouse',
      button: 0,
      pointerId: 1,
    });
    fireEvent.pointerMove(document, {
      clientX: segment.startPoint.x + (segment.endPoint.x - segment.startPoint.x) * 0.5,
      clientY: segment.startPoint.y + (segment.endPoint.y - segment.startPoint.y) * 0.5,
      pointerType: 'mouse',
      pointerId: 1,
    });
    fireEvent.pointerUp(document, {
      pointerType: 'mouse',
      pointerId: 1,
    });

    const updatedIncoming = engine.getClipKeyframes('clip-1')[1].incoming?.handle;
    expect(updatedIncoming?.x).toBeCloseTo(0.5);
    expect(updatedIncoming?.y).toBeCloseTo(0.5);
  });

  it('reports tangent handle double-click gestures without built-in policy', () => {
    const engine = createEngine();
    const onTangentHandleDoubleClick = vi.fn();

    const { container } = render(
      <TimelineProvider engine={engine}>
        <KeyframeTangentInteractionLayer
          property="opacity"
          onTangentHandleDoubleClick={onTangentHandleDoubleClick}
        />
      </TimelineProvider>
    );

    const handle = container.querySelector('[data-side="outgoing"]') as HTMLElement;
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

    expect(onTangentHandleDoubleClick).toHaveBeenCalledTimes(1);
    expect(onTangentHandleDoubleClick).toHaveBeenCalledWith(
      expect.objectContaining({
        clip: expect.objectContaining({ id: 'clip-1' }),
        keyframe: expect.objectContaining({ id: 'opacity-start' }),
        side: 'outgoing',
      }),
      expect.objectContaining({ engine })
    );
  });
});
