import { TimelineProvider } from '#react/Provider';
import {
  TimelineEngine,
  createTimelineScalarKeyframeProperty,
} from '@techsquidtv/canvas-timeline-core';
import type { TimelineKeyframe } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, vi } from 'vite-plus/test';

export function installKeyframePointerMocks() {
  const capture = Object.getOwnPropertyDescriptor(Element.prototype, 'setPointerCapture');
  const release = Object.getOwnPropertyDescriptor(Element.prototype, 'releasePointerCapture');
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 1000,
      height: 200,
      top: 32,
      left: 0,
      bottom: 232,
      right: 1000,
      x: 0,
      y: 32,
      toJSON: () => ({}),
    });
    Object.defineProperty(Element.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(Element.prototype, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (capture) {
      Object.defineProperty(Element.prototype, 'setPointerCapture', capture);
    } else {
      Reflect.deleteProperty(Element.prototype, 'setPointerCapture');
    }
    if (release) {
      Object.defineProperty(Element.prototype, 'releasePointerCapture', release);
    } else {
      Reflect.deleteProperty(Element.prototype, 'releasePointerCapture');
    }
  });
}

export function createKeyframeInteractionEngine(keys?: TimelineKeyframe[]) {
  return new TimelineEngine({
    duration: fromSeconds(10),
    tracks: [
      {
        id: 'track',
        kind: 'visual',
        selected: true,
        locked: false,
        muted: false,
        visible: true,
        clips: [
          {
            id: 'clip',
            sourceId: 'source',
            timelineStart: fromSeconds(1),
            timelineEnd: fromSeconds(5),
            sourceStart: fromSeconds(0),
            selected: true,
            keyframes: keys ?? [
              { id: 'a', property: 'opacity', time: fromSeconds(1), value: 1 },
              { id: 'b', property: 'opacity', time: fromSeconds(3), value: 0.5 },
              { id: 'c', property: 'opacity', time: fromSeconds(5), value: 0 },
            ],
          },
        ],
      },
    ],
    keyframeProperties: [
      createTimelineScalarKeyframeProperty({ id: 'opacity', min: 0, max: 1, defaultValue: 1 }),
    ],
    zoomScale: 100,
    zoomConstraints: { frameRate: 24 },
  });
}

export function renderKeyframeLayer(
  engine: TimelineEngine,
  children: ReactNode
): RenderResult & { stage: HTMLElement } {
  const view = render(
    <TimelineProvider engine={engine}>
      <div data-testid="stage">{children}</div>
    </TimelineProvider>
  );
  return { ...view, stage: view.getByTestId('stage') };
}

export const pointer = (clientX: number, clientY: number, pointerId = 1) => ({
  clientX,
  clientY,
  pointerId,
  button: 0,
  pointerType: 'mouse',
});
