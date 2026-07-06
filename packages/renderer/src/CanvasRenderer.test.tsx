import { act, render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  createTimelineScalarKeyframeProperty,
  TimelineEngine,
  type TimelineKeyframePropertyDefinition,
} from '@techsquidtv/canvas-timeline-core';
import { TimelineProvider } from '@techsquidtv/canvas-timeline-react';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { CanvasRenderer } from './CanvasRenderer';
import { TimelineCanvasLayer } from './TimelineCanvasLayer';
import type { TimelineCanvasLayerDrawContext } from './useTimelineCanvasLayer';

const levelKeyframeProperty = createTimelineScalarKeyframeProperty({
  id: 'level',
  min: 0,
  max: 1,
  defaultValue: 1,
});

const throwingKeyframeProperty: TimelineKeyframePropertyDefinition<'throwing'> = {
  id: 'throwing',
  min: 0,
  max: 1,
  defaultValue: 0,
  clampValue: (value) => value,
  normalizeValue: (value) => {
    if (value === 0.5) {
      throw new RangeError('Cannot normalize test value.');
    }
    return value;
  },
  denormalizeValue: (normalized) => normalized,
};

class MockWorker {
  static instances: MockWorker[] = [];

  messages: unknown[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn((message: unknown) => {
    this.messages.push(message);
  });
  terminate = vi.fn();

  constructor() {
    MockWorker.instances.push(this);
  }
}

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];

  callback: ResizeObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }
}

function createEngine() {
  return new TimelineEngine({
    duration: fromSeconds(10),
    tracks: [],
  });
}

function createEngineWithClip() {
  return new TimelineEngine({
    duration: fromSeconds(10),
    scrollLeft: 250,
    tracks: [
      {
        id: 'video-1',
        kind: 'visual',
        clips: [
          {
            id: 'clip-1',
            sourceId: 'source-1',
            timelineStart: fromSeconds(1),
            timelineEnd: fromSeconds(4),
            sourceStart: fromSeconds(10),
            selected: false,
          },
        ],
        locked: false,
        muted: false,
        visible: true,
        selected: false,
      },
    ],
    zoomScale: 200,
  });
}

function createEngineWithKeyframes() {
  return new TimelineEngine({
    duration: fromSeconds(10),
    keyframeProperties: [levelKeyframeProperty],
    tracks: [
      {
        id: 'video-1',
        kind: 'visual',
        clips: [
          {
            id: 'clip-1',
            sourceId: 'source-1',
            timelineStart: fromSeconds(0),
            timelineEnd: fromSeconds(4),
            sourceStart: fromSeconds(0),
            selected: true,
            keyframes: [
              {
                id: 'level-start',
                property: 'level',
                time: fromSeconds(0),
                value: 0,
              },
              {
                id: 'level-end',
                property: 'level',
                time: fromSeconds(4),
                value: 1,
              },
            ],
          },
        ],
        locked: false,
        muted: false,
        visible: true,
        selected: false,
      },
    ],
    zoomScale: 100,
  });
}

function createEngineWithThrowingKeyframes() {
  return new TimelineEngine({
    duration: fromSeconds(10),
    keyframeProperties: [throwingKeyframeProperty],
    tracks: [
      {
        id: 'video-1',
        kind: 'visual',
        clips: [
          {
            id: 'clip-1',
            sourceId: 'source-1',
            timelineStart: fromSeconds(0),
            timelineEnd: fromSeconds(4),
            sourceStart: fromSeconds(0),
            selected: true,
            keyframes: [
              {
                id: 'throwing-middle',
                property: 'throwing',
                time: fromSeconds(2),
                value: 0.5,
              },
            ],
          },
        ],
        locked: false,
        muted: false,
        visible: true,
        selected: false,
      },
    ],
    zoomScale: 100,
  });
}

function getMessage<T extends { type: string }>(worker: MockWorker, type: T['type']) {
  return worker.messages.find((message): message is T => {
    return (
      typeof message === 'object' && message !== null && 'type' in message && message.type === type
    );
  });
}

describe('CanvasRenderer', () => {
  let originalTransferControlToOffscreen: PropertyDescriptor | undefined;

  beforeEach(() => {
    MockWorker.instances = [];
    MockResizeObserver.instances = [];
    originalTransferControlToOffscreen = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      'transferControlToOffscreen'
    );
    Object.defineProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen', {
      configurable: true,
      value: vi.fn(() => ({ width: 0, height: 0 })),
    });
    vi.stubGlobal('Worker', MockWorker);
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });

  afterEach(() => {
    if (originalTransferControlToOffscreen) {
      Object.defineProperty(
        HTMLCanvasElement.prototype,
        'transferControlToOffscreen',
        originalTransferControlToOffscreen
      );
    } else {
      delete (HTMLCanvasElement.prototype as Partial<HTMLCanvasElement>).transferControlToOffscreen;
    }
    vi.unstubAllGlobals();
  });

  it('posts resolved renderer theme options to the worker on init', async () => {
    render(
      <TimelineProvider engine={createEngine()}>
        <div style={{ '--timeline-canvas-background': '#010203' } as React.CSSProperties}>
          <CanvasRenderer
            theme={{
              colors: {
                clip: {
                  bg: '#111111',
                },
              },
            }}
          />
        </div>
      </TimelineProvider>
    );

    await waitFor(() => expect(MockWorker.instances.length).toBe(1));
    const worker = MockWorker.instances[0];
    const initMessage = getMessage<{
      options: {
        showClipLabels: boolean;
        showInOutBoundaryLines: boolean;
        showInOutPoints: boolean;
        showRulerLabels: boolean;
        showSnapLines: boolean;
        theme: {
          colors: {
            background: string;
            clip: { bg: string };
          };
        };
      };
      type: 'INIT';
    }>(worker, 'INIT');

    expect(initMessage?.options.showClipLabels).toBe(true);
    expect(initMessage?.options.showInOutBoundaryLines).toBe(false);
    expect(initMessage?.options.showInOutPoints).toBe(true);
    expect(initMessage?.options.showRulerLabels).toBe(true);
    expect(initMessage?.options.showSnapLines).toBe(true);
    expect(initMessage?.options.theme.colors.background).toBe('rgb(1, 2, 3)');
    expect(initMessage?.options.theme.colors.clip.bg).toBe('#111111');
  });

  it('posts prepared keyframe geometry for a registered renderer property', async () => {
    const getBoundingClientRect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({
        bottom: 160,
        height: 160,
        left: 0,
        right: 400,
        top: 0,
        width: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

    render(
      <TimelineProvider engine={createEngineWithKeyframes()}>
        <CanvasRenderer keyframeProperty="level" showClipLabels={false} />
      </TimelineProvider>
    );

    await waitFor(() => expect(MockWorker.instances.length).toBe(1));
    const worker = MockWorker.instances[0];
    const initMessage = getMessage<{
      keyframesRequested: boolean;
      options: {
        keyframeGeometry?: { clips: Array<{ clipId: string }>; property: string };
        showKeyframes: boolean;
      };
      type: 'INIT';
    }>(worker, 'INIT');

    expect(initMessage?.options.showKeyframes).toBe(true);
    expect(initMessage?.keyframesRequested).toBe(true);
    expect(initMessage?.options.keyframeGeometry?.property).toBe('level');
    expect(initMessage?.options.keyframeGeometry?.clips).toHaveLength(1);

    getBoundingClientRect.mockRestore();
  });

  it('reports keyframe geometry preparation errors without throwing', async () => {
    const onRenderError = vi.fn();

    expect(() => {
      render(
        <TimelineProvider engine={createEngineWithThrowingKeyframes()}>
          <CanvasRenderer keyframeProperty="throwing" onRenderError={onRenderError} />
        </TimelineProvider>
      );
    }).not.toThrow();

    await waitFor(() =>
      expect(onRenderError).toHaveBeenCalledWith({
        reason: 'invalid-options',
        message: 'CanvasRenderer could not prepare keyframe geometry.',
        cause: expect.any(RangeError),
      })
    );
    const worker = MockWorker.instances[0];
    const initMessage = getMessage<{
      keyframesRequested: boolean;
      options: {
        keyframeGeometry?: unknown;
        showKeyframes: boolean;
      };
      type: 'INIT';
    }>(worker, 'INIT');

    expect(initMessage?.options.showKeyframes).toBe(false);
    expect(initMessage?.keyframesRequested).toBe(true);
    expect(initMessage?.options.keyframeGeometry).toBeUndefined();
  });

  it('rounds fractional CSS sizes up for the canvas backing bitmap', async () => {
    const getBoundingClientRect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({
        bottom: 50.25,
        height: 50.25,
        left: 0,
        right: 100.25,
        top: 0,
        width: 100.25,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
    vi.stubGlobal('devicePixelRatio', 2);

    const { container } = render(
      <TimelineProvider engine={createEngine()}>
        <CanvasRenderer />
      </TimelineProvider>
    );

    await waitFor(() => expect(MockWorker.instances.length).toBe(1));
    const canvas = container.querySelector('canvas');

    expect(canvas?.width).toBe(201);
    expect(canvas?.height).toBe(101);

    getBoundingClientRect.mockRestore();
  });

  it('reports unsupported OffscreenCanvas transfer instead of throwing', async () => {
    delete (HTMLCanvasElement.prototype as Partial<HTMLCanvasElement>).transferControlToOffscreen;
    const onRenderError = vi.fn();

    render(
      <TimelineProvider engine={createEngine()}>
        <CanvasRenderer onRenderError={onRenderError} />
      </TimelineProvider>
    );

    await waitFor(() =>
      expect(onRenderError).toHaveBeenCalledWith({
        reason: 'offscreen-unavailable',
        message: 'CanvasRenderer requires HTMLCanvasElement.transferControlToOffscreen support.',
      })
    );
    expect(MockWorker.instances).toHaveLength(0);
  });

  it('rounds fractional resize sizes up for worker resize messages', async () => {
    vi.stubGlobal('devicePixelRatio', 2);

    render(
      <TimelineProvider engine={createEngine()}>
        <CanvasRenderer />
      </TimelineProvider>
    );

    await waitFor(() => expect(MockResizeObserver.instances.length).toBe(1));
    const worker = MockWorker.instances[0];
    worker.messages = [];

    MockResizeObserver.instances[0].callback(
      [
        {
          contentRect: {
            bottom: 50.25,
            height: 50.25,
            left: 0,
            right: 100.25,
            top: 0,
            width: 100.25,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          },
        } as ResizeObserverEntry,
      ],
      MockResizeObserver.instances[0] as unknown as ResizeObserver
    );

    const resizeMessage = getMessage<{
      dpr: number;
      height: number;
      type: 'RESIZE';
      width: number;
    }>(worker, 'RESIZE');

    expect(resizeMessage).toMatchObject({
      dpr: 2,
      height: 101,
      type: 'RESIZE',
      width: 201,
    });
  });

  it('posts updated resolved theme options when themeKey changes', async () => {
    const engine = createEngine();
    const renderTheme = (themeKey: string, bgColor: string) => (
      <TimelineProvider engine={engine}>
        <div style={{ '--timeline-canvas-background': bgColor } as React.CSSProperties}>
          <CanvasRenderer showSnapLines={false} themeKey={themeKey} />
        </div>
      </TimelineProvider>
    );

    const view = render(renderTheme('light', '#010203'));

    await waitFor(() => expect(MockWorker.instances.length).toBe(1));
    const worker = MockWorker.instances[0];
    await waitFor(() => expect(getMessage(worker, 'INIT')).toBeTruthy());
    worker.messages = [];

    view.rerender(renderTheme('dark', '#040506'));

    await waitFor(() => expect(getMessage(worker, 'UPDATE_OPTIONS')).toBeTruthy());
    const updateMessage = getMessage<{
      options: {
        showSnapLines: boolean;
        theme: { colors: { background: string } };
      };
      type: 'UPDATE_OPTIONS';
    }>(worker, 'UPDATE_OPTIONS');

    expect(updateMessage?.options.showSnapLines).toBe(false);
    expect(updateMessage?.options.theme.colors.background).toBe('rgb(4, 5, 6)');
  });

  it('posts clip render options to the worker', async () => {
    render(
      <TimelineProvider engine={createEngine()}>
        <CanvasRenderer showClipLabels={false} showClips={false} showRulerLabels={false} />
      </TimelineProvider>
    );

    await waitFor(() => expect(MockWorker.instances.length).toBe(1));
    const worker = MockWorker.instances[0];
    const initMessage = getMessage<{
      options: {
        showClipLabels: boolean;
        showClips: boolean;
        showRulerLabels: boolean;
      };
      type: 'INIT';
    }>(worker, 'INIT');

    expect(initMessage?.options.showClipLabels).toBe(false);
    expect(initMessage?.options.showClips).toBe(false);
    expect(initMessage?.options.showRulerLabels).toBe(false);
  });

  it('draws a custom canvas layer with visible clips and cleans up subscriptions', async () => {
    const engine = createEngineWithClip();
    const clearRect = vi.fn();
    const setTransform = vi.fn();
    const canvasContext = {
      clearRect,
      scale: vi.fn(),
      setTransform,
    } as Partial<CanvasRenderingContext2D> as CanvasRenderingContext2D;
    const draw = vi.fn((context: TimelineCanvasLayerDrawContext) => {
      expect(context.width).toBe(320);
      expect(context.height).toBe(120);
    });
    const frameCallbacks: FrameRequestCallback[] = [];
    const getBoundingClientRect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({
        bottom: 120,
        height: 120,
        left: 0,
        right: 320,
        top: 0,
        width: 320,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation((contextId) => (contextId === '2d' ? canvasContext : null));
    const requestAnimationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      });
    const cancelAnimationFrame = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);
    vi.stubGlobal('devicePixelRatio', 2);

    const flushFrames = () => {
      const pending = frameCallbacks.splice(0, frameCallbacks.length);
      for (const callback of pending) {
        callback(16);
      }
    };

    const { container, unmount } = render(
      <TimelineProvider engine={engine}>
        <TimelineCanvasLayer draw={draw} overscanPixels={10} />
      </TimelineProvider>
    );

    act(() => {
      flushFrames();
    });

    await waitFor(() => expect(draw).toHaveBeenCalledTimes(1));
    const canvas = container.querySelector('canvas');
    const firstContext = draw.mock.calls[0][0];

    expect(canvas?.width).toBe(640);
    expect(canvas?.height).toBe(240);
    expect(firstContext.dpr).toBe(2);
    expect(firstContext.clipRects).toHaveLength(1);
    expect(firstContext.visibleClips.map(({ clip }) => clip.id)).toEqual(['clip-1']);
    expect(toSeconds(firstContext.visibleClips[0].visibleSourceStartTime)).toBeCloseTo(10.2);
    expect(setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    expect(clearRect).toHaveBeenCalledWith(0, 0, 320, 120);

    act(() => {
      firstContext.requestDraw();
      flushFrames();
    });

    expect(draw).toHaveBeenCalledTimes(2);

    const callsBeforeUnmount = draw.mock.calls.length;
    unmount();

    act(() => {
      engine.setScrollLeft(0);
      flushFrames();
    });

    expect(draw).toHaveBeenCalledTimes(callsBeforeUnmount);
    expect(MockResizeObserver.instances[0].disconnect).toHaveBeenCalledTimes(1);

    getBoundingClientRect.mockRestore();
    getContext.mockRestore();
    requestAnimationFrame.mockRestore();
    cancelAnimationFrame.mockRestore();
  });

  it('forwards worker render stats when diagnostics are enabled', async () => {
    const onRenderStats = vi.fn();

    render(
      <TimelineProvider engine={createEngine()}>
        <CanvasRenderer onRenderStats={onRenderStats} />
      </TimelineProvider>
    );

    await waitFor(() => expect(MockWorker.instances.length).toBe(1));
    const worker = MockWorker.instances[0];
    const initMessage = getMessage<{
      diagnosticsEnabled: boolean;
      type: 'INIT';
    }>(worker, 'INIT');

    expect(initMessage?.diagnosticsEnabled).toBe(true);

    worker.onmessage?.({
      data: {
        type: 'RENDER_STATS',
        stats: {
          reason: 'state',
          startedAt: 10,
          completedAt: 14,
          drawDurationMs: 4,
        },
      },
    } as MessageEvent);

    expect(onRenderStats).toHaveBeenCalledWith({
      reason: 'state',
      startedAt: 10,
      completedAt: 14,
      drawDurationMs: 4,
    });
  });
});
