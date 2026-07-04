import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { TimelineProvider } from '../../Provider';
import { expectDefined } from '../../../../../test-utils/assertions';
import {
  ViewportScrollbarHandle,
  ViewportScrollbarRoot,
  ViewportScrollbarThumb,
} from './ViewportScrollbar';

function createViewportScrollbarEngine() {
  const engine = new TimelineEngine({
    tracks: [
      {
        id: 'video-1',
        kind: 'visual',
        selected: false,
        locked: false,
        muted: false,
        visible: true,
        clips: [
          {
            id: 'clip-1',
            sourceId: 'source-1',
            timelineStart: fromSeconds(0),
            timelineEnd: fromSeconds(20),
            sourceStart: fromSeconds(0),
            selected: false,
          },
        ],
      },
    ],
  });

  engine.setViewportWidth(1000);
  engine.setZoomScale(100);
  return engine;
}

function renderViewportScrollbar(
  engine = createViewportScrollbarEngine(),
  thumbProps: React.HTMLAttributes<HTMLDivElement> = {},
  rootProps: Partial<React.ComponentProps<typeof ViewportScrollbarRoot>> = {}
) {
  const view = render(
    <TimelineProvider engine={engine}>
      <ViewportScrollbarRoot {...rootProps}>
        <ViewportScrollbarThumb {...thumbProps}>
          <ViewportScrollbarHandle side="start" />
          <div className="timeline-editor-scrollbar-fill" />
          <ViewportScrollbarHandle side="end" />
        </ViewportScrollbarThumb>
      </ViewportScrollbarRoot>
    </TimelineProvider>
  );

  return { engine, ...view };
}

function mockRootWidth(root: HTMLElement, width = 1000) {
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
    bottom: 10,
    height: 10,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

describe('ViewportScrollbar', () => {
  it('provides focusable horizontal scrollbar semantics by default', () => {
    const { container } = renderViewportScrollbar();

    const thumb = container.querySelector('.range-scrollbar-thumb');
    const startHandle = container.querySelector('[data-side="start"]');
    const endHandle = container.querySelector('[data-side="end"]');

    expect(thumb?.getAttribute('role')).toBe('scrollbar');
    expect(thumb?.getAttribute('tabindex')).toBe('0');
    expect(thumb?.getAttribute('aria-orientation')).toBe('horizontal');
    expect(thumb?.getAttribute('aria-label')).toBe('Timeline viewport');
    expect(thumb?.getAttribute('aria-valuetext')).toBe(
      '0 seconds to 10 seconds, duration 10 seconds'
    );
    expect(startHandle?.getAttribute('aria-label')).toBe('Timeline viewport start');
    expect(startHandle?.getAttribute('aria-valuetext')).toBe('0 seconds');
    expect(endHandle?.getAttribute('aria-label')).toBe('Timeline viewport end');
    expect(endHandle?.getAttribute('aria-valuetext')).toBe('10 seconds');
  });

  it('pans the timeline viewport from the keyboard on the thumb', () => {
    const { container, engine } = renderViewportScrollbar();
    const thumb = expectDefined(
      container.querySelector('.range-scrollbar-thumb'),
      'viewport scrollbar thumb'
    );

    fireEvent.keyDown(thumb, { key: 'ArrowRight' });

    expect(engine.scrollLeft).toBe(40);
  });

  it('allows consumers to override viewport keyboard step sizes', () => {
    const { container, engine } = renderViewportScrollbar(
      createViewportScrollbarEngine(),
      {},
      { keyboardStep: 2 }
    );
    const thumb = expectDefined(
      container.querySelector('.range-scrollbar-thumb'),
      'viewport scrollbar thumb'
    );

    fireEvent.keyDown(thumb, { key: 'ArrowRight' });

    expect(engine.scrollLeft).toBe(200);
  });

  it('resizes the timeline viewport from the keyboard on a handle', () => {
    const engine = createViewportScrollbarEngine();
    engine.setScrollLeft(500);

    const { container } = renderViewportScrollbar(engine);
    const startHandle = expectDefined(
      container.querySelector('[data-side="start"]'),
      'viewport scrollbar start handle'
    );

    fireEvent.keyDown(startHandle, { key: 'ArrowRight' });

    expect(engine.zoomScale).toBeGreaterThan(100);
    expect(engine.scrollLeft).toBeGreaterThan(500);
  });

  it('pans from thumb dragging and removes drag listeners on pointer cancellation', () => {
    const { container, engine } = renderViewportScrollbar();
    const root = container.querySelector('.range-scrollbar') as HTMLElement;
    const thumb = container.querySelector('.range-scrollbar-thumb') as HTMLElement;
    mockRootWidth(root);

    fireEvent.pointerDown(thumb, {
      button: 0,
      clientX: 0,
      pointerId: 1,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(window, { clientX: 10, pointerId: 1 });
    expect(engine.scrollLeft).toBe(20);

    fireEvent.pointerCancel(window, { pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 20, pointerId: 1 });

    expect(engine.scrollLeft).toBe(20);
  });

  it('lets consumers cancel internal thumb dragging', () => {
    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
    };
    const { container, engine } = renderViewportScrollbar(createViewportScrollbarEngine(), {
      onPointerDown,
    });
    const thumb = container.querySelector('.range-scrollbar-thumb') as HTMLElement;

    fireEvent.pointerDown(thumb, {
      button: 0,
      clientX: 0,
      pointerId: 1,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(window, { clientX: 10, pointerId: 1 });

    expect(engine.scrollLeft).toBe(0);
  });

  it('keeps scroll and zoom clamped by engine bounds', () => {
    const { container, engine } = renderViewportScrollbar();
    const root = container.querySelector('.range-scrollbar') as HTMLElement;
    const thumb = container.querySelector('.range-scrollbar-thumb') as HTMLElement;
    const endHandle = container.querySelector('[data-side="end"]') as HTMLElement;
    mockRootWidth(root);

    fireEvent.pointerDown(thumb, {
      button: 0,
      clientX: 0,
      pointerId: 1,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(window, { clientX: 2000, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    expect(engine.scrollLeft).toBe(engine.maxScrollLeft);

    fireEvent.keyDown(endHandle, { key: 'PageDown' });
    fireEvent.keyDown(endHandle, { key: 'PageDown' });

    expect(engine.zoomScale).toBeGreaterThanOrEqual(50);
    expect(engine.scrollLeft).toBeLessThanOrEqual(engine.maxScrollLeft);
  });
});
