import { afterEach, expect, test, vi } from 'vite-plus/test';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import type { ActiveClip, ActiveLayerResult } from '@techsquidtv/canvas-timeline-core';
import type { MediabunnyAdapter } from '#mediabunny-adapter/index';

afterEach(() => {
  vi.doUnmock('react');
  vi.doUnmock('#mediabunny-adapter/createMediabunnyAdapter');
  vi.doUnmock('@techsquidtv/canvas-timeline-react');
  vi.unstubAllGlobals();
  vi.resetModules();
});

function createMediaSyncEngine() {
  return new TimelineEngine({
    duration: fromSeconds(8),
    playheadTime: fromSeconds(0),
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
            id: 'video-clip',
            sourceId: 'source-1',
            timelineStart: fromSeconds(0),
            timelineEnd: fromSeconds(4),
            sourceStart: fromSeconds(0),
            selected: false,
          },
        ],
      },
      {
        id: 'audio-1',
        kind: 'audio',
        selected: false,
        locked: false,
        muted: false,
        visible: true,
        clips: [
          {
            id: 'audio-clip',
            sourceId: 'source-1',
            timelineStart: fromSeconds(0),
            timelineEnd: fromSeconds(4),
            sourceStart: fromSeconds(0),
            selected: false,
          },
        ],
      },
    ],
  });
}

function urlSource(sourceId: string, url: string) {
  return { sourceId, input: { kind: 'url' as const, url } };
}

function createTestAdapter(overrides: Partial<MediabunnyAdapter> = {}): MediabunnyAdapter {
  return {
    ready: true,
    status: 'Ready.',
    error: null,
    lastFrameTime: null,
    sourceStateById: new Map([
      [
        'source-1',
        {
          sourceId: 'source-1',
          status: 'ready',
          selectedInputIndex: 0,
          attempts: [
            {
              inputIndex: 0,
              status: 'ready',
              error: null,
            },
          ],
          metadata: {
            firstTimestampSeconds: 0,
            sourceFirstTimestampSeconds: 0,
            presentationStartTimestampSeconds: 0,
            endTimestampSeconds: 4,
            sourceEndTimestampSeconds: 4,
            durationSeconds: 4,
            video: null,
            audio: null,
          },
          error: null,
        },
      ],
    ]),
    volume: 0.7,
    muted: false,
    audioStatus: { state: 'unavailable' },
    subscribeFrame: () => () => {},
    setCanvas: vi.fn(),
    getClockTime: vi.fn(() => 0),
    startClock: vi.fn(() => true),
    stopClock: vi.fn(),
    requestClockActivation: () => {},
    setVolume: () => {},
    setMuted: () => {},
    setSources: () => {},
    preloadSource: (sourceId: string) => Promise.resolve({ ok: true, sourceId, state: 'ready' }),
    unloadSource: () => true,
    retrySource: (sourceId: string) =>
      Promise.resolve({
        ok: false,
        sourceId,
        reason: 'unknown-source',
        error: new Error('unavailable'),
      }),
    replaceSource: (source) =>
      Promise.resolve({
        ok: false,
        sourceId: source.sourceId,
        reason: 'load-failed',
        error: new Error('unavailable'),
      }),
    setClockRate: () => {},
    seek: vi.fn(() => Promise.resolve()),
    renderVideo: () => Promise.resolve(),
    syncAudio: () => {},
    syncLayers: vi.fn(() => Promise.resolve()),
    onStatus: vi.fn(),
    clearVideo: () => {},
    getFrame: () => Promise.resolve(null),
    dispose: vi.fn(),
    ...overrides,
  } satisfies MediabunnyAdapter;
}

test('useMediabunnyAdapter creates, updates, and disposes the browser adapter', () => {
  const canvas = document.createElement('canvas');
  const replacementCanvas = document.createElement('canvas');
  const dispose = vi.fn();
  const setCanvas = vi.fn();
  const setSources = vi.fn();
  const adapter = createTestAdapter({ dispose, setCanvas, setSources });
  const createMediabunnyAdapter = vi.fn(() => adapter);
  const mediabunny = () => Promise.resolve({} as never);

  vi.doMock('#mediabunny-adapter/createMediabunnyAdapter', async () => ({
    createMediabunnyAdapter,
  }));

  return import('#mediabunny-adapter/react').then(
    async ({ useMediabunnyAdapter: useMockedMediabunnyAdapter }) => {
      const { result, rerender, unmount } = renderHook(
        ({ currentCanvas }: { currentCanvas: HTMLCanvasElement }) => {
          return useMockedMediabunnyAdapter({
            canvas: currentCanvas,
            mediabunny,
            sources: [{ sourceId: 'source-1', input: '/sample.mp4' }],
          });
        },
        { initialProps: { currentCanvas: canvas } }
      );

      await waitFor(() => {
        expect(result.current).toBe(adapter);
      });
      expect(createMediabunnyAdapter).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: expect.objectContaining({
            context: undefined,
            destination: undefined,
          }),
          mediabunny: expect.any(Function),
          sources: [{ sourceId: 'source-1', input: '/sample.mp4' }],
          onChange: expect.any(Function),
        })
      );
      expect(setCanvas).toHaveBeenCalledWith(canvas);
      const firstAdapter = result.current;
      rerender({ currentCanvas: canvas });
      expect(result.current).toBe(firstAdapter);
      expect(createMediabunnyAdapter).toHaveBeenCalledTimes(1);
      expect(setSources).toHaveBeenCalled();

      rerender({ currentCanvas: replacementCanvas });
      expect(setCanvas).toHaveBeenLastCalledWith(replacementCanvas);
      expect(result.current).toBe(firstAdapter);

      unmount();
      expect(dispose).toHaveBeenCalled();
    }
  );
}, 10_000);

test('useMediabunnyAdapter keeps StrictMode updates on the currently owned adapter', async () => {
  const records: Array<{
    adapter: MediabunnyAdapter;
    disposed: boolean;
    setCanvas: ReturnType<typeof vi.fn>;
    setMuted: ReturnType<typeof vi.fn>;
    setSources: ReturnType<typeof vi.fn>;
    setVolume: ReturnType<typeof vi.fn>;
  }> = [];
  const createMediabunnyAdapter = vi.fn(() => {
    const record = {
      adapter: null as MediabunnyAdapter | null,
      disposed: false,
      setCanvas: vi.fn(),
      setMuted: vi.fn(),
      setSources: vi.fn(),
      setVolume: vi.fn(),
    };
    const assertOwned = () => {
      if (record.disposed) {
        throw new Error('stale React effect reached a disposed adapter');
      }
    };
    record.setCanvas.mockImplementation(assertOwned);
    record.setMuted.mockImplementation(assertOwned);
    record.setSources.mockImplementation(assertOwned);
    record.setVolume.mockImplementation(assertOwned);
    const adapter = createTestAdapter({
      setCanvas: record.setCanvas,
      setMuted: record.setMuted,
      setSources: record.setSources,
      setVolume: record.setVolume,
      dispose: vi.fn(() => {
        record.disposed = true;
      }),
    });
    record.adapter = adapter;
    records.push(record as (typeof records)[number]);
    return adapter;
  });
  vi.doMock('#mediabunny-adapter/createMediabunnyAdapter', async () => ({
    createMediabunnyAdapter,
  }));
  const { useMediabunnyAdapter: useMockedMediabunnyAdapter } =
    await import('#mediabunny-adapter/react');
  const initialCanvas = document.createElement('canvas');
  const replacementCanvas = document.createElement('canvas');
  const initialLoader = () => Promise.resolve({} as never);
  const replacementLoader = () => Promise.resolve({} as never);
  const wrapper = ({ children }: React.PropsWithChildren) => (
    <React.StrictMode>{children}</React.StrictMode>
  );
  const { result, rerender } = renderHook(
    ({
      canvas,
      loader,
      muted,
      sourceUrl,
      volume,
    }: {
      canvas: HTMLCanvasElement;
      loader: () => Promise<never>;
      muted: boolean;
      sourceUrl: string;
      volume: number;
    }) =>
      useMockedMediabunnyAdapter({
        audio: { muted, volume },
        canvas,
        mediabunny: loader,
        sources: [urlSource('source-1', sourceUrl)],
      }),
    {
      initialProps: {
        canvas: initialCanvas,
        loader: initialLoader,
        muted: false,
        sourceUrl: '/initial.mp4',
        volume: 0.7,
      },
      wrapper,
    }
  );

  await waitFor(() => {
    expect(records.length).toBeGreaterThanOrEqual(1);
    expect(result.current).toBe(records.at(-1)?.adapter);
  });

  rerender({
    canvas: replacementCanvas,
    loader: replacementLoader,
    muted: true,
    sourceUrl: '/replacement.mp4',
    volume: 0.4,
  });

  await waitFor(() => {
    const current = records.at(-1);
    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(result.current).toBe(current?.adapter);
    expect(current?.setSources).toHaveBeenLastCalledWith([
      urlSource('source-1', '/replacement.mp4'),
    ]);
    expect(current?.setCanvas).toHaveBeenLastCalledWith(replacementCanvas);
    expect(current?.setMuted).toHaveBeenLastCalledWith(true);
    expect(current?.setVolume).toHaveBeenLastCalledWith(0.4);
  });

  expect(records.slice(0, -1).every((record) => record.disposed)).toBe(true);
});

test('useMediabunnyAdapter returns noop behavior when window is unavailable', async () => {
  const useEffect = vi.fn((effect: () => void | (() => void)) => {
    effect();
  });
  const useState = <T,>(value: T) => [value, vi.fn()] as const;

  vi.doMock('react', async () => ({
    useCallback: <T,>(callback: T) => callback,
    useEffect,
    useReducer: () => [0, vi.fn()],
    useRef: <T,>(value: T) => ({ current: value }),
    useState,
    useSyncExternalStore: vi.fn(),
  }));
  vi.doMock('@techsquidtv/canvas-timeline-react', async () => ({
    useTimelineMediaSync: vi.fn(),
  }));
  vi.stubGlobal('window', undefined);

  const { useMediabunnyAdapter: useServerMediabunnyAdapter } =
    await import('#mediabunny-adapter/react');
  const adapter = useServerMediabunnyAdapter({
    mediabunny: () => Promise.resolve({} as never),
    sources: [],
  });

  expect(adapter.ready).toBe(false);
  expect(adapter.status).toBe('Mediabunny is waiting for the browser.');
  expect(adapter.getClockTime()).toBe(0);
  expect(adapter.startClock(fromSeconds(0), 1)).toBe(false);
  adapter.stopClock();
  adapter.requestClockActivation(1);
  adapter.setClockRate(1);
  await adapter.seek(fromSeconds(0), {
    time: fromSeconds(0),
    all: [],
    byTrack: new Map(),
    layers: {},
    primary: {},
    hasActiveClips: false,
  } satisfies ActiveLayerResult<string>);
  await adapter.renderVideo({} as ActiveClip, fromSeconds(0));
  adapter.syncAudio(undefined, fromSeconds(0), 'pause');
  await adapter.syncLayers({
    timelineTime: fromSeconds(0),
    reason: 'pause',
    activeLayers: {
      time: fromSeconds(0),
      all: [],
      byTrack: new Map(),
      layers: {},
      primary: {},
      hasActiveClips: false,
    },
  });
  adapter.clearVideo();
  await expect(adapter.getFrame({} as ActiveClip)).resolves.toBeNull();
  adapter.dispose();
  expect(useEffect).toHaveBeenCalled();
});

test('useMediabunnyTimelineMedia creates an adapter and exposes sync state', async () => {
  const canvas = document.createElement('canvas');
  const adapter = createTestAdapter({
    status: 'Ready. Mediabunny can drive timeline video and audio.',
    lastFrameTime: 1.25,
  });
  const createMediabunnyAdapter = vi.fn(() => adapter);
  const engine = createMediaSyncEngine();
  const layers = {
    visuals: { trackKind: 'visual', sourceId: 'source-1' },
    audio: { trackKind: 'audio', sourceId: 'source-1' },
  } as const;

  vi.doMock('#mediabunny-adapter/createMediabunnyAdapter', async () => ({
    createMediabunnyAdapter,
  }));

  const [{ useMediabunnyTimelineMedia }, { TimelineProvider }] = await Promise.all([
    import('#mediabunny-adapter/react'),
    import('@techsquidtv/canvas-timeline-react'),
  ]);
  const { result } = renderHook(
    () =>
      useMediabunnyTimelineMedia({
        sources: [
          {
            sourceId: 'source-1',
            input: { kind: 'url', url: '/sample.mp4' },
          },
        ],
        layers,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  void act(() => result.current.canvasRef(canvas));
  await waitFor(() => expect(adapter.setCanvas).toHaveBeenCalledWith(canvas));
  expect(createMediabunnyAdapter).toHaveBeenCalledWith(
    expect.objectContaining({
      mediabunny: expect.any(Function),
      sources: [
        {
          sourceId: 'source-1',
          input: { kind: 'url', url: '/sample.mp4' },
        },
      ],
      onChange: expect.any(Function),
    })
  );
  expect(result.current.adapter).toBe(adapter);
  expect(result.current.ready).toBe(true);
  expect(result.current.status).toBe('Ready. Mediabunny can drive timeline video and audio.');
  expect('lastFrameTime' in result.current).toBe(false);
  expect(result.current.sourceStateById.get('source-1')?.metadata?.durationSeconds).toBe(4);

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({ ok: true, time: fromSeconds(0) });
  });

  expect(adapter.seek).toHaveBeenCalled();
  expect(adapter.startClock).toHaveBeenCalledWith(fromSeconds(0), 1);
});

test('useMediabunnyFrameTime updates only focused frame subscribers', async () => {
  let lastFrameTime: number | null = null;
  let frameListener: (() => void) | undefined;
  const adapter = createTestAdapter();
  Object.defineProperty(adapter, 'lastFrameTime', {
    get: () => lastFrameTime,
  });
  adapter.subscribeFrame = (listener) => {
    frameListener = listener;
    return () => {
      frameListener = undefined;
    };
  };
  const { useMediabunnyFrameTime } = await import('#mediabunny-adapter/react');
  const { result, unmount } = renderHook(() => useMediabunnyFrameTime(adapter));

  expect(result.current).toBeNull();
  act(() => {
    lastFrameTime = 1.25;
    frameListener?.();
  });
  expect(result.current).toBe(1.25);

  unmount();
  expect(frameListener).toBeUndefined();
});

test('useMediabunnyTimelineMedia accepts an explicit Mediabunny loader', async () => {
  const adapter = createTestAdapter();
  const createMediabunnyAdapter = vi.fn(() => adapter);
  const explicitLoader = () => Promise.resolve({} as never);
  const engine = createMediaSyncEngine();

  vi.doMock('#mediabunny-adapter/createMediabunnyAdapter', async () => ({
    createMediabunnyAdapter,
  }));

  const [{ useMediabunnyTimelineMedia }, { TimelineProvider }] = await Promise.all([
    import('#mediabunny-adapter/react'),
    import('@techsquidtv/canvas-timeline-react'),
  ]);
  renderHook(
    () =>
      useMediabunnyTimelineMedia({
        mediabunny: explicitLoader,
        sources: [],
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(createMediabunnyAdapter).toHaveBeenCalledWith(
    expect.objectContaining({
      mediabunny: explicitLoader,
    })
  );
});
