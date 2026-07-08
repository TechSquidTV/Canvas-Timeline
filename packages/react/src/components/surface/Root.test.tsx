import { act, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { TimelineEngine, type Track } from '@techsquidtv/canvas-timeline-core';
import { TimelineProvider } from '#react/Provider';
import { Root } from '#react/components/surface/Root';

class MockResizeObserver {
  observe() {}
  disconnect() {}
}

function createTracks(count: number): Track[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `track-${index + 1}`,
    kind: 'visual',
    clips: [],
    selected: false,
    locked: false,
    muted: false,
    visible: true,
  }));
}

describe('Root', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('prevents page wheel scrolling while panning the timeline vertically', () => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 100,
      height: 100,
      left: 0,
      right: 1000,
      top: 0,
      width: 1000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const engine = new TimelineEngine({ tracks: createTracks(4) });
    const { container } = render(
      <TimelineProvider engine={engine}>
        <Root />
      </TimelineProvider>
    );
    const root = container.querySelector('.timeline-root') as HTMLElement;
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 40,
    });

    act(() => {
      root.dispatchEvent(wheelEvent);
    });

    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(engine.scrollTop).toBe(40);
  });
});
