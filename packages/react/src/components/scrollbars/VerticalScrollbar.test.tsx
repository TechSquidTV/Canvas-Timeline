import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { TimelineProvider } from '../../Provider';
import { expectDefined } from '../../../../../test-utils/assertions';
import {
  VerticalScrollbarHandle,
  VerticalScrollbarRoot,
  VerticalScrollbarThumb,
} from './VerticalScrollbar';

function createVerticalScrollbarEngine() {
  const engine = new TimelineEngine({
    tracks: Array.from({ length: 20 }, (_, index) => ({
      id: `track-${index}`,
      kind: 'visual',
      selected: false,
      locked: false,
      muted: false,
      visible: true,
      clips: [],
    })),
  });

  engine.setViewportHeight(200);
  return engine;
}

function renderVerticalScrollbar(engine = createVerticalScrollbarEngine()) {
  const view = render(
    <TimelineProvider engine={engine}>
      <VerticalScrollbarRoot>
        <VerticalScrollbarThumb>
          <VerticalScrollbarHandle side="start" />
          <VerticalScrollbarHandle side="end" />
        </VerticalScrollbarThumb>
      </VerticalScrollbarRoot>
    </TimelineProvider>
  );

  return { engine, ...view };
}

function mockRootHeight(root: HTMLElement, height = 200) {
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
    bottom: height,
    height,
    left: 0,
    right: 10,
    top: 0,
    width: 10,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

function expectHTMLElement(value: Element | null, label: string): HTMLElement {
  const element = expectDefined(value, label);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`${label} should be an HTMLElement.`);
  }
  return element;
}

describe('VerticalScrollbar', () => {
  it('provides focusable vertical scrollbar semantics by default', () => {
    const { container } = renderVerticalScrollbar();

    const root = container.querySelector('.range-scrollbar');
    const thumb = container.querySelector('.range-scrollbar-thumb');
    const handles = container.querySelectorAll('.range-scrollbar-handle');

    expect(root?.getAttribute('data-orientation')).toBe('vertical');
    expect(thumb?.getAttribute('role')).toBe('scrollbar');
    expect(thumb?.getAttribute('tabindex')).toBe('0');
    expect(thumb?.getAttribute('aria-orientation')).toBe('vertical');
    expect(thumb?.getAttribute('aria-label')).toBe('Timeline vertical viewport');
    expect(handles).toHaveLength(2);
    expect(container.querySelector('[data-side="start"]')?.getAttribute('aria-label')).toBe(
      'Timeline vertical viewport start'
    );
    expect(container.querySelector('[data-side="end"]')?.getAttribute('aria-label')).toBe(
      'Timeline vertical viewport end'
    );
  });

  it('pans vertical timeline scroll from keyboard and dragging', () => {
    const { container, engine } = renderVerticalScrollbar();
    const root = expectHTMLElement(container.querySelector('.range-scrollbar'), 'vertical root');
    const thumb = expectDefined(
      container.querySelector('.range-scrollbar-thumb'),
      'vertical thumb'
    );
    mockRootHeight(root);

    fireEvent.keyDown(thumb, { key: 'ArrowDown' });
    expect(engine.scrollTop).toBe(40);

    fireEvent.pointerDown(thumb, {
      button: 0,
      clientY: 0,
      pointerId: 1,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(window, { clientY: 20, pointerId: 1 });

    expect(engine.scrollTop).toBeGreaterThan(40);
  });

  it('zooms track row heights from vertical handles', () => {
    const { container, engine } = renderVerticalScrollbar();
    const root = expectHTMLElement(container.querySelector('.range-scrollbar'), 'vertical root');
    const endHandle = expectDefined(container.querySelector('[data-side="end"]'), 'end handle');
    mockRootHeight(root);
    const renderEvent = vi.fn();
    const settledEvent = vi.fn();
    engine.on('render', renderEvent);
    engine.on('state:settled', settledEvent);

    expect(engine.tracks[0].height).toBeUndefined();

    fireEvent.pointerDown(endHandle, {
      button: 0,
      clientY: 200,
      pointerId: 1,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(window, { clientY: 180, pointerId: 1 });

    const heightAfterFirstMove = expectDefined(engine.tracks[0].height, 'zoomed track height');
    fireEvent.pointerMove(window, { clientY: 180, pointerId: 1 });

    expect(heightAfterFirstMove).toBeGreaterThan(48);
    expect(engine.tracks[0].height).toBe(heightAfterFirstMove);
    expect(renderEvent).toHaveBeenCalledTimes(1);
    expect(settledEvent).toHaveBeenCalledTimes(1);
  });
});
