import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { PlayheadArea } from './PlayheadArea';
import { PlayheadGrabber } from './PlayheadGrabber';
import { globalTapState } from '../interactions/tapState';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { TimelineProvider } from '../../Provider';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';

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
let getBoundingClientRectMock: ReturnType<typeof vi.fn<() => DOMRect>>;

beforeEach(() => {
  getBoundingClientRectMock = vi.fn<() => DOMRect>(() => new DOMRect(0, 0, 1000, 100));
  Element.prototype.getBoundingClientRect = getBoundingClientRectMock;
  Element.prototype.setPointerCapture = vi.fn<(pointerId: number) => void>();
  Element.prototype.releasePointerCapture = vi.fn<(pointerId: number) => void>();
});

afterEach(() => {
  restoreElementPrototypeMethod('getBoundingClientRect', originalGetBoundingClientRect);
  restoreElementPrototypeMethod('setPointerCapture', originalSetPointerCapture);
  restoreElementPrototypeMethod('releasePointerCapture', originalReleasePointerCapture);
  vi.clearAllMocks();
});

describe('Double tap tracking', () => {
  let engine: TimelineEngine;

  beforeEach(() => {
    engine = new TimelineEngine({ tracks: [] });
    globalTapState.time = 0;
    globalTapState.x = 0;
    globalTapState.y = 0;
  });

  it('triggers onDoubleClick in PlayheadArea when tapped twice quickly', () => {
    const handleDoubleClick = vi.fn();

    render(
      <TimelineProvider engine={engine}>
        <PlayheadArea onDoubleClick={handleDoubleClick} />
      </TimelineProvider>
    );

    const el = screen.getByTitle('Scrub timeline / Double click or double tap to add marker');

    // First tap
    fireEvent.pointerDown(el, {
      clientX: 50,
      clientY: 10,
      timeStamp: 1000,
      pointerType: 'mouse',
      button: 0,
    });

    expect(handleDoubleClick).not.toHaveBeenCalled();

    // Second tap (100ms later, well within 300ms limit, same position)
    fireEvent.pointerDown(el, {
      clientX: 50,
      clientY: 10,
      timeStamp: 1100,
      pointerType: 'mouse',
      button: 0,
    });

    expect(handleDoubleClick).toHaveBeenCalledTimes(1);

    // Check if the time was calculated correctly based on X position
    // x = 50, left = 0, zoomScale defaults to 1 pixel/ms? Wait, default might be different.
    // The test just checks that it's called.
  });

  it('does not trigger onDoubleClick if taps are too far apart in time', () => {
    vi.useFakeTimers();
    const handleDoubleClick = vi.fn();

    render(
      <TimelineProvider engine={engine}>
        <PlayheadArea onDoubleClick={handleDoubleClick} />
      </TimelineProvider>
    );

    const el = screen.getByTitle('Scrub timeline / Double click or double tap to add marker');

    // First tap
    fireEvent.pointerDown(el, {
      clientX: 50,
      clientY: 10,
      pointerType: 'mouse',
      button: 0,
    });

    vi.advanceTimersByTime(400);

    // Second tap (400ms later, exceeds 300ms limit)
    fireEvent.pointerDown(el, {
      clientX: 50,
      clientY: 10,
      pointerType: 'mouse',
      button: 0,
    });

    expect(handleDoubleClick).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does not trigger onDoubleClick if taps are too far apart in distance', () => {
    const handleDoubleClick = vi.fn();

    render(
      <TimelineProvider engine={engine}>
        <PlayheadArea onDoubleClick={handleDoubleClick} />
      </TimelineProvider>
    );

    const el = screen.getByTitle('Scrub timeline / Double click or double tap to add marker');

    // First tap
    fireEvent.pointerDown(el, {
      clientX: 50,
      clientY: 10,
      timeStamp: 1000,
      pointerType: 'mouse',
      button: 0,
    });

    // Second tap (100ms later, but 30px away, exceeds 20px limit)
    fireEvent.pointerDown(el, {
      clientX: 80,
      clientY: 10,
      timeStamp: 1100,
      pointerType: 'mouse',
      button: 0,
    });

    expect(handleDoubleClick).not.toHaveBeenCalled();
  });

  it('scrubs PlayheadArea with touch without reading layout on every move', () => {
    engine = new TimelineEngine({
      duration: fromSeconds(10),
      tracks: [],
      zoomScale: 100,
    });

    render(
      <TimelineProvider engine={engine}>
        <PlayheadArea />
      </TimelineProvider>
    );

    const el = screen.getByTitle('Scrub timeline / Double click or double tap to add marker');

    fireEvent.pointerDown(el, {
      clientX: 100,
      clientY: 10,
      pointerId: 1,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(el, {
      clientX: 700,
      clientY: 10,
      pointerId: 1,
      pointerType: 'touch',
    });
    fireEvent.pointerUp(el, {
      clientX: 700,
      clientY: 10,
      pointerId: 1,
      pointerType: 'touch',
    });

    expect(toSeconds(engine.playheadTime)).toBe(7);
    expect(getBoundingClientRectMock).toHaveBeenCalledTimes(1);
  });

  it('pauses playback when a PlayheadArea scrub starts', () => {
    engine = new TimelineEngine({
      duration: fromSeconds(10),
      tracks: [],
      zoomScale: 100,
    });
    engine.play({ clock: 'external' });

    render(
      <TimelineProvider engine={engine}>
        <PlayheadArea />
      </TimelineProvider>
    );

    const el = screen.getByTitle('Scrub timeline / Double click or double tap to add marker');

    fireEvent.pointerDown(el, {
      clientX: 100,
      clientY: 10,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
    });

    expect(engine.getState().playing).toBe(false);
    expect(toSeconds(engine.playheadTime)).toBe(1);
  });

  it('triggers onDoubleClick in PlayheadGrabber when tapped twice quickly', () => {
    const handleDoubleClick = vi.fn();

    // For playhead grabber, we need to mock setPointerCapture which JSDOM lacks
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();

    render(
      <TimelineProvider engine={engine}>
        <PlayheadGrabber onDoubleClick={handleDoubleClick} />
      </TimelineProvider>
    );

    // Get the element. It has role="slider" or a specific SVG path.
    // Let's use generic container query since we don't have aria-labels yet.
    // PlayheadGrabber returns an SVG. We can query it by looking at container's first child or similar.
    const { container } = render(
      <TimelineProvider engine={engine}>
        <PlayheadGrabber onDoubleClick={handleDoubleClick} className="test-grabber" />
      </TimelineProvider>
    );

    const el = container.querySelector('.test-grabber') as Element;
    expect(el).toBeTruthy();

    // First tap
    fireEvent.pointerDown(el, {
      clientX: 100,
      clientY: 20,
      timeStamp: 1000,
      pointerType: 'mouse',
      button: 0,
    });

    expect(handleDoubleClick).not.toHaveBeenCalled();

    // Second tap (100ms later)
    fireEvent.pointerDown(el, {
      clientX: 100,
      clientY: 20,
      timeStamp: 1100,
      pointerType: 'mouse',
      button: 0,
    });

    expect(handleDoubleClick).toHaveBeenCalledTimes(1);
  });

  it('pauses playback when a PlayheadGrabber drag starts', () => {
    engine = new TimelineEngine({
      duration: fromSeconds(10),
      tracks: [],
      zoomScale: 100,
    });
    engine.play({ clock: 'external' });

    const { container } = render(
      <TimelineProvider engine={engine}>
        <PlayheadGrabber className="test-grabber" />
      </TimelineProvider>
    );

    const el = container.querySelector('.test-grabber') as Element;

    fireEvent.pointerDown(el, {
      clientX: 100,
      clientY: 20,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
    });

    expect(engine.getState().playing).toBe(false);
  });

  it('renders a visible playhead affordance without demo-only CSS', () => {
    const { container } = render(
      <TimelineProvider engine={engine}>
        <PlayheadGrabber />
      </TimelineProvider>
    );

    const line = container.querySelector('.timeline-playhead-grabber-line');
    const handle = container.querySelector('.timeline-playhead-grabber-handle');

    expect(line).not.toBeNull();
    expect(handle).not.toBeNull();
    expect(line?.className).toContain('timeline-playhead-grabber-line');
    expect(handle?.className).toContain('timeline-playhead-grabber-handle');
  });

  it('positions the playhead grabber from the latest engine time during scrub events', () => {
    engine = new TimelineEngine({ duration: fromSeconds(10), tracks: [], zoomScale: 100 });
    const { container } = render(
      <TimelineProvider engine={engine}>
        <PlayheadGrabber />
      </TimelineProvider>
    );
    const grabber = container.querySelector('.timeline-playhead-grabber') as HTMLElement;

    expect(grabber.style.transform).toBe('translateX(0px)');

    engine.updatePlayhead(fromSeconds(2));

    expect(grabber.style.transform).toBe('translateX(200px)');
  });

  it('shares tap state across different elements (regression test)', () => {
    const handleDoubleClickGrabber = vi.fn();
    const handleDoubleClickArea = vi.fn();

    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();

    const { container } = render(
      <TimelineProvider engine={engine}>
        <PlayheadArea onDoubleClick={handleDoubleClickArea} />
        <PlayheadGrabber onDoubleClick={handleDoubleClickGrabber} className="test-grabber" />
      </TimelineProvider>
    );

    const areaEl = screen.getByTitle('Scrub timeline / Double click or double tap to add marker');
    const grabberEl = container.querySelector('.test-grabber') as Element;

    // First tap on the Grabber
    fireEvent.pointerDown(grabberEl, {
      clientX: 50,
      clientY: 20,
      timeStamp: 1000,
      pointerType: 'mouse',
      button: 0,
    });

    // Second tap on the Area right next to it (10px away)
    fireEvent.pointerDown(areaEl, {
      clientX: 50,
      clientY: 25,
      timeStamp: 1100,
      pointerType: 'mouse',
      button: 0,
    });

    // The double click should trigger on the Area because that's where the second click happened!
    expect(handleDoubleClickArea).toHaveBeenCalledTimes(1);
    expect(handleDoubleClickGrabber).not.toHaveBeenCalled();
  });

  it('supports custom composable children and render function prop', () => {
    const { container, rerender } = render(
      <TimelineProvider engine={engine}>
        <PlayheadGrabber>
          <div className="custom-static-child" />
        </PlayheadGrabber>
      </TimelineProvider>
    );

    expect(container.querySelector('.custom-static-child')).not.toBeNull();
    expect(container.querySelector('.timeline-playhead-grabber-line')).toBeNull();

    rerender(
      <TimelineProvider engine={engine}>
        <PlayheadGrabber>
          {({ dragging, time }) => (
            <div className="custom-render-prop" data-dragging={dragging}>
              Time: {time.v / time.r}
            </div>
          )}
        </PlayheadGrabber>
      </TimelineProvider>
    );

    const renderPropEl = container.querySelector('.custom-render-prop');
    expect(renderPropEl).not.toBeNull();
    expect(renderPropEl?.textContent).toContain('Time: 0');
    expect(renderPropEl?.getAttribute('data-dragging')).toBe('false');
  });
});
