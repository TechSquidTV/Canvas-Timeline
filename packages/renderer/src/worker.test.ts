import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { TimelineEngine, type TimelineState } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import type { TimelineRenderOptions } from './render/types';

type RenderTimelineMock = ReturnType<
  typeof vi.fn<
    (
      ctx: OffscreenCanvasRenderingContext2D,
      canvas: OffscreenCanvas,
      state: TimelineState,
      dpr: number,
      options: TimelineRenderOptions
    ) => void
  >
>;

type TestWorkerMessage =
  | {
      type: 'INIT';
      canvas: OffscreenCanvas;
      state: TimelineState;
      options?: TimelineRenderOptions;
      keyframesRequested?: boolean;
    }
  | {
      type: 'UPDATE_STATE';
      state: TimelineState;
      keyframeGeometry?: TimelineRenderOptions['keyframeGeometry'];
      keyframesRequested?: boolean;
    }
  | {
      type: 'RESIZE';
      width: number;
      height: number;
      keyframeGeometry?: TimelineRenderOptions['keyframeGeometry'];
      keyframesRequested?: boolean;
    };

interface TestWorkerScope extends Window {
  onmessage: ((event: MessageEvent<TestWorkerMessage>) => void) | null;
  postMessage: (message: unknown) => void;
}

function createState(): TimelineState {
  return new TimelineEngine({
    duration: fromSeconds(10),
    tracks: [],
  }).getState();
}

function createCanvas(): OffscreenCanvas {
  const context = {} as OffscreenCanvasRenderingContext2D;
  const getContext: OffscreenCanvas['getContext'] = ((contextId: OffscreenRenderingContextId) =>
    contextId === '2d' ? context : null) as OffscreenCanvas['getContext'];
  const canvas: Partial<OffscreenCanvas> = {
    getContext,
    height: 100,
    width: 200,
  };
  return canvas as OffscreenCanvas;
}

function postWorkerMessage(message: TestWorkerMessage) {
  const workerScope = self as TestWorkerScope;
  workerScope.onmessage?.({ data: message } as MessageEvent<TestWorkerMessage>);
}

function lastRenderOptions(renderTimeline: RenderTimelineMock) {
  const lastCall = renderTimeline.mock.calls.at(-1);
  if (!lastCall) {
    throw new Error('Expected worker renderTimeline to have been called.');
  }
  return lastCall[4];
}

describe('renderer worker', () => {
  let renderTimeline: RenderTimelineMock;

  beforeEach(async () => {
    vi.resetModules();
    renderTimeline = vi.fn(() => undefined);
    vi.doMock('./renderTimeline', () => ({ renderTimeline }));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('postMessage', vi.fn());
    await import('./worker');
  });

  afterEach(() => {
    vi.doUnmock('./renderTimeline');
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('preserves prepared keyframe geometry when worker update messages omit it', () => {
    const keyframeGeometry = {
      clips: [],
      property: 'level',
    } satisfies NonNullable<TimelineRenderOptions['keyframeGeometry']>;

    postWorkerMessage({
      type: 'INIT',
      canvas: createCanvas(),
      state: createState(),
      keyframesRequested: true,
      options: {
        keyframeGeometry,
        showKeyframes: true,
      },
    });
    expect(lastRenderOptions(renderTimeline).keyframeGeometry).toBe(keyframeGeometry);
    expect(lastRenderOptions(renderTimeline).showKeyframes).toBe(true);

    postWorkerMessage({
      type: 'UPDATE_STATE',
      state: createState(),
      keyframesRequested: true,
    });
    expect(lastRenderOptions(renderTimeline).keyframeGeometry).toBe(keyframeGeometry);
    expect(lastRenderOptions(renderTimeline).showKeyframes).toBe(true);

    postWorkerMessage({
      type: 'RESIZE',
      width: 300,
      height: 160,
      keyframesRequested: true,
    });
    expect(lastRenderOptions(renderTimeline).keyframeGeometry).toBe(keyframeGeometry);
    expect(lastRenderOptions(renderTimeline).showKeyframes).toBe(true);

    postWorkerMessage({
      type: 'UPDATE_STATE',
      state: createState(),
      keyframeGeometry: undefined,
      keyframesRequested: true,
    });
    expect(lastRenderOptions(renderTimeline).keyframeGeometry).toBeUndefined();
    expect(lastRenderOptions(renderTimeline).showKeyframes).toBe(false);
  });
});
