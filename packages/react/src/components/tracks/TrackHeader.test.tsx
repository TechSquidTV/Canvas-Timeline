import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { TimelineEngine, type Track } from '@techsquidtv/canvas-timeline-core';
import { TimelineProvider } from '../../Provider';
import { TrackHeader, TrackHeaderList, TrackHeaderResizeHandle } from './TrackHeader';

function getElementPrototypeMethod<K extends 'setPointerCapture' | 'releasePointerCapture'>(
  name: K
): Element[K] | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, name);
  return typeof descriptor?.value === 'function' ? (descriptor.value as Element[K]) : undefined;
}

function restoreElementPrototypeMethod<K extends 'setPointerCapture' | 'releasePointerCapture'>(
  name: K,
  method: Element[K] | undefined
): void {
  if (method) {
    Element.prototype[name] = method;
    return;
  }
  Reflect.deleteProperty(Element.prototype, name);
}

const originalSetPointerCapture = getElementPrototypeMethod('setPointerCapture');
const originalReleasePointerCapture = getElementPrototypeMethod('releasePointerCapture');
let setPointerCaptureMock: ReturnType<typeof vi.fn<(pointerId: number) => void>>;
let releasePointerCaptureMock: ReturnType<typeof vi.fn<(pointerId: number) => void>>;

function createTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'video-1',
    kind: 'visual',
    clips: [],
    selected: false,
    locked: false,
    muted: false,
    visible: true,
    height: 48,
    name: 'Video 1',
    ...overrides,
  };
}

function createEngine(track: Track = createTrack()) {
  return new TimelineEngine({ tracks: [track] });
}

describe('TrackHeader', () => {
  beforeEach(() => {
    setPointerCaptureMock = vi.fn<(pointerId: number) => void>();
    releasePointerCaptureMock = vi.fn<(pointerId: number) => void>();
    Element.prototype.setPointerCapture = setPointerCaptureMock;
    Element.prototype.releasePointerCapture = releasePointerCaptureMock;
  });

  afterEach(() => {
    restoreElementPrototypeMethod('setPointerCapture', originalSetPointerCapture);
    restoreElementPrototypeMethod('releasePointerCapture', originalReleasePointerCapture);
  });

  it('renders header rows with track state attributes and render-prop controls', () => {
    const engine = createEngine(createTrack({ selected: true }));

    const { container, getByText } = render(
      <TimelineProvider engine={engine}>
        <TrackHeaderList>
          <TrackHeader trackId="video-1">
            {(header) => (
              <button type="button" onClick={() => header.setVisible(false)}>
                {header.label}
              </button>
            )}
          </TrackHeader>
        </TrackHeaderList>
      </TimelineProvider>
    );

    const list = container.querySelector('.timeline-track-header-list');
    const header = container.querySelector('.timeline-track-header') as HTMLElement;

    expect(list?.getAttribute('role')).toBe('group');
    expect(list?.getAttribute('aria-label')).toBe('Timeline track headers');
    expect(header.getAttribute('role')).toBe('group');
    expect(header.getAttribute('aria-label')).toBe('Video 1');
    expect(header.getAttribute('data-track-id')).toBe('video-1');
    expect(header.getAttribute('data-track-selected')).toBe('true');
    expect(header.getAttribute('data-track-visible')).toBe('true');
    expect(header.style.height).toBe('48px');

    fireEvent.click(getByText('Video 1'));

    expect(engine.getState().tracks[0].visible).toBe(false);
    expect(header.getAttribute('data-track-visible')).toBe('false');
  });

  it('resizes a track with pointer capture on the resize handle', () => {
    const engine = createEngine();

    const { container } = render(
      <TimelineProvider engine={engine}>
        <TrackHeader trackId="video-1">
          <TrackHeaderResizeHandle trackId="video-1" />
        </TrackHeader>
      </TimelineProvider>
    );

    const handle = container.querySelector('.timeline-track-header-resize-handle') as HTMLElement;

    fireEvent.pointerDown(handle, {
      button: 0,
      clientY: 0,
      pointerId: 1,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(handle, { clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(engine.getState().tracks[0].height).toBe(68);
    expect(setPointerCaptureMock).toHaveBeenCalledWith(1);
    expect(releasePointerCaptureMock).toHaveBeenCalledWith(1);
  });

  it('exposes resize handle value semantics and keyboard resizing', () => {
    const engine = createEngine();

    const { container } = render(
      <TimelineProvider engine={engine}>
        <TrackHeader trackId="video-1">
          <TrackHeaderResizeHandle trackId="video-1" maxHeight={72} />
        </TrackHeader>
      </TimelineProvider>
    );

    const handle = container.querySelector('.timeline-track-header-resize-handle') as HTMLElement;

    expect(handle.getAttribute('role')).toBe('separator');
    expect(handle.getAttribute('aria-valuemin')).toBe('24');
    expect(handle.getAttribute('aria-valuemax')).toBe('72');
    expect(handle.getAttribute('aria-valuenow')).toBe('48');
    expect(handle.getAttribute('aria-valuetext')).toBe('48 pixels');

    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    expect(engine.getState().tracks[0].height).toBe(56);

    fireEvent.keyDown(handle, { key: 'End' });
    expect(engine.getState().tracks[0].height).toBe(72);

    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    expect(engine.getState().tracks[0].height).toBe(72);
  });
});
