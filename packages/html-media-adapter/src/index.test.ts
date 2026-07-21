import { expect, test, vi } from 'vite-plus/test';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { TimelineProvider } from '@techsquidtv/canvas-timeline-react';
import { createHTMLMediaAdapter } from '#html-media-adapter/index';
import { useHTMLMediaAdapter, useHTMLTimelineMedia } from '#html-media-adapter/react';

function htmlSources(source: string | Blob | File = '/sample.mp4') {
  return [
    {
      sourceId: 'source-1',
      input: source,
    },
  ] as const;
}

function createMediaSyncEngine() {
  return new TimelineEngine({
    duration: fromSeconds(12),
    playheadTime: fromSeconds(1),
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
            timelineEnd: fromSeconds(5),
            sourceStart: fromSeconds(10),
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
            timelineEnd: fromSeconds(5),
            sourceStart: fromSeconds(20),
            selected: false,
          },
        ],
      },
    ],
  });
}

test('createHTMLMediaAdapter maps active clip source time to a media element', async () => {
  const engine = createMediaSyncEngine();
  const element = document.createElement('video');
  const play = vi.spyOn(element, 'play').mockResolvedValue(undefined);
  const pause = vi.spyOn(element, 'pause').mockImplementation(() => {});
  const adapter = createHTMLMediaAdapter({
    element,
    sources: htmlSources(),
  });
  const activeVideo = engine.getActiveClip({
    time: fromSeconds(1.25),
    trackKind: 'visual',
    sourceId: 'source-1',
  });

  expect(activeVideo).toBeDefined();
  await adapter.seek?.(
    fromSeconds(1.25),
    engine.getActiveLayers({
      time: fromSeconds(1.25),
      layers: {
        visuals: { trackKind: 'visual', sourceId: 'source-1' },
      },
    })
  );
  await expect(adapter.startClock(fromSeconds(1.25), 1.5)).resolves.toBe(true);

  expect(element.src).toBe('http://localhost:3000/sample.mp4');
  expect(element.currentTime).toBe(11.25);
  expect(element.playbackRate).toBe(1.5);
  expect(play).toHaveBeenCalled();
  expect(adapter.getClockTime()).toBe(1.25);

  adapter.dispose();
  expect(pause).toHaveBeenCalled();
});

test('createHTMLMediaAdapter normalizes relative sources without reassigning matching src', async () => {
  const engine = createMediaSyncEngine();
  const element = document.createElement('video');
  let assignedSrc = '';
  let srcAssignments = 0;
  Object.defineProperty(element, 'src', {
    configurable: true,
    get: () => assignedSrc,
    set: (value) => {
      assignedSrc = value;
      srcAssignments += 1;
    },
  });
  const adapter = createHTMLMediaAdapter({
    element,
    sources: htmlSources('sample.mp4'),
  });
  const activeLayers = engine.getActiveLayers({
    time: fromSeconds(1),
    layers: {
      visuals: { trackKind: 'visual', sourceId: 'source-1' },
    },
  });

  await adapter.seek?.(fromSeconds(1), activeLayers);
  await adapter.seek?.(fromSeconds(1), activeLayers);

  expect(assignedSrc).toBe('http://localhost:3000/sample.mp4');
  expect(srcAssignments).toBe(1);
});

test('createHTMLMediaAdapter initializes every configured source as idle', () => {
  const element = document.createElement('video');
  const adapter = createHTMLMediaAdapter({
    element,
    sources: [
      { sourceId: 'source-1', input: '/first.mp4' },
      { sourceId: 'source-2', input: '/second.mp4' },
    ],
  });

  expect([...adapter.sourceStateById.values()]).toEqual([
    {
      sourceId: 'source-1',
      status: 'idle',
      selectedInputIndex: null,
      attempts: [],
      error: null,
    },
    {
      sourceId: 'source-2',
      status: 'idle',
      selectedInputIndex: null,
      attempts: [],
      error: null,
    },
  ]);
});

test('createHTMLMediaAdapter rejects an empty source ID', () => {
  const element = document.createElement('video');

  expect(() =>
    createHTMLMediaAdapter({
      element,
      sources: [{ sourceId: '', input: '/sample.mp4' }],
    })
  ).toThrow('HTML media sourceId cannot be empty.');
});

test('createHTMLMediaAdapter disposes object URLs for blob sources', async () => {
  const engine = createMediaSyncEngine();
  const element = document.createElement('video');
  vi.spyOn(element, 'pause').mockImplementation(() => {});
  const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:sample');
  const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const adapter = createHTMLMediaAdapter({
    element,
    sources: htmlSources(new Blob(['sample'])),
  });

  await adapter.seek?.(
    fromSeconds(1),
    engine.getActiveLayers({
      time: fromSeconds(1),
      layers: {
        visuals: { trackKind: 'visual', sourceId: 'source-1' },
      },
    })
  );
  adapter.dispose();

  expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:sample');

  createObjectURL.mockRestore();
  revokeObjectURL.mockRestore();
});

test('createHTMLMediaAdapter switches rates and stops playback', async () => {
  const engine = createMediaSyncEngine();
  const element = document.createElement('video');
  vi.spyOn(element, 'play').mockResolvedValue(undefined);
  const pause = vi.spyOn(element, 'pause').mockImplementation(() => {});
  const adapter = createHTMLMediaAdapter({
    element,
    sources: htmlSources(),
  });

  await adapter.seek?.(
    fromSeconds(1),
    engine.getActiveLayers({
      time: fromSeconds(1),
      layers: {
        visuals: { trackKind: 'visual', sourceId: 'source-1' },
      },
    })
  );
  await adapter.startClock(fromSeconds(1), 1);
  adapter.setClockRate?.(2);
  adapter.stopClock?.();

  expect(element.playbackRate).toBe(2);
  expect(pause).toHaveBeenCalled();
});

test('createHTMLMediaAdapter reports rejected native playback', async () => {
  const engine = createMediaSyncEngine();
  const element = document.createElement('video');
  vi.spyOn(element, 'play').mockRejectedValue(new Error('gesture required'));
  vi.spyOn(element, 'pause').mockImplementation(() => {});
  const adapter = createHTMLMediaAdapter({
    element,
    sources: htmlSources(),
  });

  await adapter.seek?.(
    fromSeconds(1),
    engine.getActiveLayers({
      time: fromSeconds(1),
      layers: {
        visuals: { trackKind: 'visual', sourceId: 'source-1' },
      },
    })
  );

  await expect(adapter.startClock(fromSeconds(1), 1)).rejects.toThrow('gesture required');
});

test('createHTMLMediaAdapter keeps initial playback attached across an input fallback', async () => {
  const engine = createMediaSyncEngine();
  const element = document.createElement('video');
  let rejectPreferredInput: (error: Error) => void = () => {};
  const preferredPlay = new Promise<void>((_resolve, reject) => {
    rejectPreferredInput = reject;
  });
  const play = vi
    .spyOn(element, 'play')
    .mockImplementationOnce(() => preferredPlay)
    .mockResolvedValueOnce(undefined);
  vi.spyOn(element, 'pause').mockImplementation(() => {});
  vi.spyOn(element, 'load').mockImplementation(() => {});
  const adapter = createHTMLMediaAdapter({
    element,
    sources: [
      {
        sourceId: 'source-1',
        input: '/preferred.mp4',
        fallbacks: ['/fallback.mp4'],
      },
    ],
  });
  const activeLayers = engine.getActiveLayers({
    time: fromSeconds(1),
    layers: {
      visuals: { trackKind: 'visual', sourceId: 'source-1' },
    },
  });

  await adapter.seek?.(fromSeconds(1), activeLayers);
  const startPromise = adapter.startClock(fromSeconds(1), 1);
  element.dispatchEvent(new Event('error'));
  rejectPreferredInput(new Error('preferred input failed'));

  await expect(startPromise).resolves.toBe(true);
  expect(play).toHaveBeenCalledTimes(2);
  expect(element.src).toBe('http://localhost:3000/fallback.mp4');
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'recovering',
    selectedInputIndex: 1,
  });
});

test('createHTMLMediaAdapter keeps startup pending when play rejects before the error event', async () => {
  const engine = createMediaSyncEngine();
  const element = document.createElement('video');
  let rejectPreferredInput: (error: Error) => void = () => {};
  const preferredPlay = new Promise<void>((_resolve, reject) => {
    rejectPreferredInput = reject;
  });
  const play = vi
    .spyOn(element, 'play')
    .mockImplementationOnce(() => preferredPlay)
    .mockResolvedValueOnce(undefined);
  vi.spyOn(element, 'pause').mockImplementation(() => {});
  vi.spyOn(element, 'load').mockImplementation(() => {});
  Object.defineProperty(element, 'error', {
    configurable: true,
    get: () =>
      ({
        code: 4,
        message: 'preferred input failed',
      }) as MediaError,
  });
  const adapter = createHTMLMediaAdapter({
    element,
    sources: [
      {
        sourceId: 'source-1',
        input: '/preferred.mp4',
        fallbacks: ['/fallback.mp4'],
      },
    ],
  });
  const activeLayers = engine.getActiveLayers({
    time: fromSeconds(1),
    layers: {
      visuals: { trackKind: 'visual', sourceId: 'source-1' },
    },
  });

  await adapter.seek?.(fromSeconds(1), activeLayers);
  const startPromise = adapter.startClock(fromSeconds(1), 1);
  rejectPreferredInput(new Error('preferred input failed'));
  await Promise.resolve();
  element.dispatchEvent(new Event('error'));

  await expect(startPromise).resolves.toBe(true);
  expect(play).toHaveBeenCalledTimes(2);
  expect(element.src).toBe('http://localhost:3000/fallback.mp4');
});

test('createHTMLMediaAdapter continues pending playback after active source replacement', async () => {
  const engine = createMediaSyncEngine();
  const element = document.createElement('video');
  let rejectOriginalPlay = (_error: Error) => {};
  const originalPlay = new Promise<void>((_resolve, reject) => {
    rejectOriginalPlay = reject;
  });
  const play = vi
    .spyOn(element, 'play')
    .mockImplementationOnce(() => originalPlay)
    .mockResolvedValueOnce(undefined);
  vi.spyOn(element, 'pause').mockImplementation(() => {});
  const adapter = createHTMLMediaAdapter({
    element,
    sources: htmlSources('/original.mp4'),
  });
  const activeLayers = engine.getActiveLayers({
    time: fromSeconds(1),
    layers: { visuals: { trackKind: 'visual', sourceId: 'source-1' } },
  });

  await adapter.seek?.(fromSeconds(1), activeLayers);
  const startPromise = adapter.startClock(fromSeconds(1), 1);
  await adapter.replaceSource({ sourceId: 'source-1', input: '/replacement.mp4' });
  rejectOriginalPlay(new DOMException('Playback was interrupted.', 'AbortError'));

  await expect(startPromise).resolves.toBe(true);
  expect(play).toHaveBeenCalledTimes(2);
  expect(element.src).toBe('http://localhost:3000/replacement.mp4');
});

function createPendingFallbackStartup() {
  const engine = createMediaSyncEngine();
  const element = document.createElement('video');
  let resolveOriginalPlay = () => {};
  let rejectOriginalPlay = (_error: Error) => {};
  const originalPlay = new Promise<void>((resolve, reject) => {
    resolveOriginalPlay = resolve;
    rejectOriginalPlay = reject;
  });
  const play = vi
    .spyOn(element, 'play')
    .mockImplementationOnce(() => originalPlay)
    .mockResolvedValueOnce(undefined);
  vi.spyOn(element, 'pause').mockImplementation(() => {});
  vi.spyOn(element, 'load').mockImplementation(() => {});
  Object.defineProperty(element, 'error', {
    configurable: true,
    get: () =>
      ({
        code: 4,
        message: 'original input failed',
      }) as MediaError,
  });
  const adapter = createHTMLMediaAdapter({
    element,
    sources: [
      {
        sourceId: 'source-1',
        input: '/original.mp4',
        fallbacks: ['/fallback.mp4'],
      },
    ],
  });
  const activeLayers = engine.getActiveLayers({
    time: fromSeconds(1),
    layers: { visuals: { trackKind: 'visual', sourceId: 'source-1' } },
  });

  return {
    activeLayers,
    adapter,
    element,
    play,
    rejectOriginalPlay,
    resolveOriginalPlay,
  };
}

test.each([
  {
    transition: 'replacement',
    apply: (adapter: ReturnType<typeof createHTMLMediaAdapter>) =>
      adapter.replaceSource({ sourceId: 'source-1', input: '/replacement.mp4' }),
    expectedUrl: 'http://localhost:3000/replacement.mp4',
  },
  {
    transition: 'retry',
    apply: (adapter: ReturnType<typeof createHTMLMediaAdapter>) => adapter.retrySource('source-1'),
    expectedUrl: 'http://localhost:3000/original.mp4',
  },
])(
  'createHTMLMediaAdapter continues startup when $transition follows a rejected play',
  async ({ apply, expectedUrl }) => {
    const { activeLayers, adapter, element, play, rejectOriginalPlay } =
      createPendingFallbackStartup();

    await adapter.seek?.(fromSeconds(1), activeLayers);
    const startPromise = adapter.startClock(fromSeconds(1), 1);
    rejectOriginalPlay(new Error('original input failed'));
    await Promise.resolve();
    await apply(adapter);

    await expect(startPromise).resolves.toBe(true);
    expect(play).toHaveBeenCalledTimes(2);
    expect(element.src).toBe(expectedUrl);
  }
);

test.each([
  {
    transition: 'replacement',
    apply: (adapter: ReturnType<typeof createHTMLMediaAdapter>) =>
      adapter.replaceSource({ sourceId: 'source-1', input: '/replacement.mp4' }),
  },
  {
    transition: 'retry',
    apply: (adapter: ReturnType<typeof createHTMLMediaAdapter>) => adapter.retrySource('source-1'),
  },
])(
  'createHTMLMediaAdapter restarts startup when a play superseded by $transition resolves',
  async ({ apply }) => {
    const { activeLayers, adapter, play, resolveOriginalPlay } = createPendingFallbackStartup();

    await adapter.seek?.(fromSeconds(1), activeLayers);
    const startPromise = adapter.startClock(fromSeconds(1), 1);
    await apply(adapter);
    resolveOriginalPlay();

    await expect(startPromise).resolves.toBe(true);
    expect(play).toHaveBeenCalledTimes(2);
  }
);

test.each([
  {
    transition: 'stop',
    apply: (adapter: ReturnType<typeof createHTMLMediaAdapter>) => adapter.stopClock?.(),
  },
  {
    transition: 'disposal',
    apply: (adapter: ReturnType<typeof createHTMLMediaAdapter>) => adapter.dispose(),
  },
])(
  'createHTMLMediaAdapter settles rejected startup immediately followed by $transition',
  async ({ apply }) => {
    const { activeLayers, adapter, rejectOriginalPlay } = createPendingFallbackStartup();

    await adapter.seek?.(fromSeconds(1), activeLayers);
    const startPromise = adapter.startClock(fromSeconds(1), 1);
    rejectOriginalPlay(new Error('original input failed'));
    apply(adapter);

    await expect(startPromise).rejects.toThrow();
  }
);

test('createHTMLMediaAdapter clears the element for missing sources and content gaps', async () => {
  const engine = createMediaSyncEngine();
  const element = document.createElement('video');
  const pause = vi.spyOn(element, 'pause').mockImplementation(() => {});
  const load = vi.spyOn(element, 'load').mockImplementation(() => {});
  const adapter = createHTMLMediaAdapter({
    element,
    sources: [],
  });

  element.src = 'http://localhost:3000/previous.mp4';
  expect(() =>
    adapter.seek?.(
      fromSeconds(1),
      engine.getActiveLayers({
        time: fromSeconds(1),
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
      })
    )
  ).toThrow('No HTML media source configured for source "source-1".');

  expect(element.getAttribute('src')).toBeNull();
  expect(pause).toHaveBeenCalled();
  expect(load).toHaveBeenCalled();

  element.src = 'http://localhost:3000/previous.mp4';
  await adapter.syncLayers?.({
    timelineTime: fromSeconds(8),
    reason: 'gap',
    activeLayers: engine.getActiveLayers({
      time: fromSeconds(8),
      layers: {
        visuals: { trackKind: 'visual', sourceId: 'source-1' },
      },
    }),
  });

  expect(element.getAttribute('src')).toBeNull();
});

test('createHTMLMediaAdapter replays synced clips only while play intent is active', async () => {
  const engine = createMediaSyncEngine();
  const element = document.createElement('video');
  const play = vi.spyOn(element, 'play').mockResolvedValue(undefined);
  vi.spyOn(element, 'pause').mockImplementation(() => {});
  const adapter = createHTMLMediaAdapter({
    element,
    sources: htmlSources(),
  });
  const activeLayers = engine.getActiveLayers({
    time: fromSeconds(1),
    layers: {
      visuals: { trackKind: 'visual', sourceId: 'source-1' },
    },
  });

  await adapter.syncLayers?.({
    timelineTime: fromSeconds(1),
    reason: 'pause',
    activeLayers,
  });
  expect(play).not.toHaveBeenCalled();

  await adapter.startClock(fromSeconds(1), 1);
  await adapter.syncLayers?.({
    timelineTime: fromSeconds(1.5),
    reason: 'tick',
    activeLayers: engine.getActiveLayers({
      time: fromSeconds(1.5),
      layers: {
        visuals: { trackKind: 'visual', sourceId: 'source-1' },
      },
    }),
  });

  expect(play).toHaveBeenCalledTimes(2);
});

test('createHTMLMediaAdapter pauses and clears play intent on non-playing status', async () => {
  const engine = createMediaSyncEngine();
  const element = document.createElement('video');
  const play = vi.spyOn(element, 'play').mockResolvedValue(undefined);
  const pause = vi.spyOn(element, 'pause').mockImplementation(() => {});
  const adapter = createHTMLMediaAdapter({
    element,
    sources: htmlSources(),
  });
  const activeLayers = engine.getActiveLayers({
    time: fromSeconds(1),
    layers: {
      visuals: { trackKind: 'visual', sourceId: 'source-1' },
    },
  });

  await adapter.seek?.(fromSeconds(1), activeLayers);
  await adapter.startClock(fromSeconds(1), 1);
  adapter.onStatus?.('content-gap');
  await adapter.syncLayers?.({
    timelineTime: fromSeconds(1),
    reason: 'tick',
    activeLayers,
  });

  expect(pause).toHaveBeenCalled();
  expect(play).toHaveBeenCalledTimes(1);
});

test('useHTMLMediaAdapter exposes a noop until its callback ref connects and disposes', async () => {
  const element = document.createElement('video');
  const pause = vi.spyOn(element, 'pause').mockImplementation(() => {});
  const connected = renderHook(() =>
    useHTMLMediaAdapter({
      sources: htmlSources(),
    })
  );

  expect(connected.result.current.ready).toBe(false);
  expect(connected.result.current.adapter.startClock(fromSeconds(1), 1)).toBe(false);
  void act(() => connected.result.current.mediaRef(element));
  await waitFor(() => {
    expect(connected.result.current.ready).toBe(true);
  });
  expect(connected.result.current.element).toBe(element);
  connected.unmount();

  expect(pause).toHaveBeenCalled();
});

test('useHTMLMediaAdapter balances native listeners under React Strict Mode', async () => {
  const element = document.createElement('video');
  vi.spyOn(element, 'pause').mockImplementation(() => {});
  const addEventListener = vi.spyOn(element, 'addEventListener');
  const removeEventListener = vi.spyOn(element, 'removeEventListener');
  const connected = renderHook(() => useHTMLMediaAdapter({ sources: htmlSources() }), {
    wrapper: ({ children }) => React.createElement(React.StrictMode, null, children),
  });

  void act(() => connected.result.current.mediaRef(element));
  await waitFor(() => expect(connected.result.current.ready).toBe(true));
  expect(addEventListener).toHaveBeenCalled();

  connected.unmount();

  expect(removeEventListener.mock.calls).toEqual(addEventListener.mock.calls);
});

test('useHTMLMediaAdapter follows callback ref replacement and removal', async () => {
  const firstElement = document.createElement('video');
  const secondElement = document.createElement('video');
  const firstPause = vi.spyOn(firstElement, 'pause').mockImplementation(() => {});
  const secondPause = vi.spyOn(secondElement, 'pause').mockImplementation(() => {});
  const { result } = renderHook(() => useHTMLMediaAdapter({ sources: htmlSources() }));

  void act(() => result.current.mediaRef(firstElement));
  await waitFor(() => expect(result.current.ready).toBe(true));
  const firstAdapter = result.current.adapter;

  void act(() => result.current.mediaRef(secondElement));
  await waitFor(() => expect(result.current.adapter).not.toBe(firstAdapter));
  expect(firstPause).toHaveBeenCalled();

  void act(() => result.current.mediaRef(null));
  await waitFor(() => expect(result.current.ready).toBe(false));
  expect(secondPause).toHaveBeenCalled();
});

test('useHTMLTimelineMedia creates an adapter and exposes synchronized transport', async () => {
  const engine = createMediaSyncEngine();
  engine.setTime(fromSeconds(8));
  const element = document.createElement('video');
  const play = vi.spyOn(element, 'play').mockResolvedValue(undefined);
  const pause = vi.spyOn(element, 'pause').mockImplementation(() => {});
  const sources = htmlSources();
  const layers = {
    visuals: { trackKind: 'visual', sourceId: 'source-1' },
  } as const;

  const { result } = renderHook(
    () =>
      useHTMLTimelineMedia({
        sources,
        layers,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  void act(() => result.current.mediaRef(element));
  await waitFor(() => {
    expect(result.current.ready).toBe(true);
  });
  expect(result.current.playbackRate).toBe(1);

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({ ok: true, time: fromSeconds(0) });
  });

  expect(play).toHaveBeenCalled();
  expect(result.current.adapter.getClockTime()).toBe(0);
  const loadingSourceStateById = result.current.sourceStateById;
  expect(loadingSourceStateById.get('source-1')?.status).toBe('loading');

  act(() => {
    element.dispatchEvent(new Event('loadedmetadata'));
  });
  expect(result.current.sourceStateById).not.toBe(loadingSourceStateById);
  expect(result.current.sourceStateById.get('source-1')?.status).toBe('ready');

  await act(async () => {
    await expect(result.current.setPlaybackRate(1.5)).resolves.toEqual({ ok: true });
  });
  expect(element.playbackRate).toBe(1.5);

  act(() => {
    expect(result.current.pause()).toEqual({ ok: true });
  });
  expect(pause).toHaveBeenCalled();
});

test('useHTMLMediaAdapter preserves adapter identity for inline-equivalent sources', async () => {
  const element = document.createElement('video');
  vi.spyOn(element, 'pause').mockImplementation(() => {});
  const { result, rerender } = renderHook(
    ({ renderCount }: { renderCount: number }) => {
      expect(renderCount).toBeGreaterThan(0);
      return useHTMLMediaAdapter({
        sources: [{ sourceId: 'source-1', input: '/sample.mp4' }],
      });
    },
    { initialProps: { renderCount: 1 } }
  );

  void act(() => result.current.mediaRef(element));
  await waitFor(() => expect(result.current.ready).toBe(true));
  const adapter = result.current.adapter;
  rerender({ renderCount: 2 });

  expect(result.current.adapter).toBe(adapter);
});

test('createHTMLMediaAdapter advances input fallbacks and exposes media controls', async () => {
  const engine = createMediaSyncEngine();
  const element = document.createElement('video');
  vi.spyOn(element, 'pause').mockImplementation(() => {});
  vi.spyOn(element, 'play').mockResolvedValue(undefined);
  const adapter = createHTMLMediaAdapter({
    element,
    sources: [
      {
        sourceId: 'source-1',
        input: '/primary.mp4',
        fallbacks: ['/fallback.mp4'],
      },
    ],
  });
  const activeLayers = engine.getActiveLayers({
    time: fromSeconds(1),
    layers: { visuals: { trackKind: 'visual', sourceId: 'source-1' } },
  });

  await adapter.seek?.(fromSeconds(1), activeLayers);
  const loadingSnapshot = adapter.sourceStateById;
  expect(adapter.sourceStateById.get('source-1')?.selectedInputIndex).toBe(0);
  element.dispatchEvent(new Event('error'));
  expect(adapter.sourceStateById).not.toBe(loadingSnapshot);
  expect(element.src).toBe('http://localhost:3000/fallback.mp4');
  expect(adapter.sourceStateById.get('source-1')?.selectedInputIndex).toBe(1);
  expect(adapter.sourceStateById.get('source-1')?.attempts).toMatchObject([
    { inputIndex: 0, status: 'failed' },
  ]);

  adapter.setVolume(0.4);
  adapter.setMuted(true);
  expect(adapter.volume).toBe(0.4);
  expect(adapter.muted).toBe(true);
});

test('createHTMLMediaAdapter surfaces terminal runtime failures to synchronization', async () => {
  const engine = createMediaSyncEngine();
  const element = document.createElement('video');
  vi.spyOn(element, 'pause').mockImplementation(() => {});
  vi.spyOn(element, 'play').mockResolvedValue(undefined);
  const adapter = createHTMLMediaAdapter({
    element,
    sources: htmlSources(),
  });
  const activeLayers = engine.getActiveLayers({
    time: fromSeconds(1),
    layers: { visuals: { trackKind: 'visual', sourceId: 'source-1' } },
  });

  await adapter.seek?.(fromSeconds(1), activeLayers);
  await expect(adapter.startClock(fromSeconds(1), 1)).resolves.toBe(true);
  element.dispatchEvent(new Event('error'));

  expect(adapter.sourceStateById.get('source-1')?.status).toBe('failed');
  await expect(
    adapter.syncLayers?.({
      timelineTime: fromSeconds(1.25),
      reason: 'tick',
      activeLayers,
    })
  ).rejects.toThrow('All HTML media inputs failed for source "source-1".');
});

test('createHTMLMediaAdapter resets input attempts for each source activation', async () => {
  const engine = new TimelineEngine({
    duration: fromSeconds(6),
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
            id: 'clip-a-1',
            sourceId: 'source-a',
            timelineStart: fromSeconds(0),
            timelineEnd: fromSeconds(2),
            sourceStart: fromSeconds(0),
            selected: false,
          },
          {
            id: 'clip-b',
            sourceId: 'source-b',
            timelineStart: fromSeconds(2),
            timelineEnd: fromSeconds(4),
            sourceStart: fromSeconds(0),
            selected: false,
          },
          {
            id: 'clip-a-2',
            sourceId: 'source-a',
            timelineStart: fromSeconds(4),
            timelineEnd: fromSeconds(6),
            sourceStart: fromSeconds(2),
            selected: false,
          },
        ],
      },
    ],
  });
  const element = document.createElement('video');
  vi.spyOn(element, 'pause').mockImplementation(() => {});
  const adapter = createHTMLMediaAdapter({
    element,
    sources: [
      { sourceId: 'source-a', input: '/a.mp4' },
      { sourceId: 'source-b', input: '/b.mp4' },
    ],
  });
  const layers = { visuals: { trackKind: 'visual' } } as const;

  for (const seconds of [1, 3, 5]) {
    await adapter.seek?.(
      fromSeconds(seconds),
      engine.getActiveLayers({ time: fromSeconds(seconds), layers })
    );
    element.dispatchEvent(new Event('loadedmetadata'));
  }

  expect(adapter.sourceStateById.get('source-a')?.attempts).toEqual([
    { inputIndex: 0, status: 'ready', error: null },
  ]);
});

test('createHTMLMediaAdapter retries failed sources from their preferred input', async () => {
  const engine = createMediaSyncEngine();
  const element = document.createElement('video');
  vi.spyOn(element, 'pause').mockImplementation(() => {});
  const adapter = createHTMLMediaAdapter({
    element,
    sources: [
      {
        sourceId: 'source-1',
        input: '/primary.mp4',
        fallbacks: ['/fallback.mp4'],
      },
    ],
  });
  const activeLayers = engine.getActiveLayers({
    time: fromSeconds(1),
    layers: { visuals: { trackKind: 'visual', sourceId: 'source-1' } },
  });

  await adapter.seek?.(fromSeconds(1), activeLayers);
  element.dispatchEvent(new Event('error'));
  element.dispatchEvent(new Event('error'));

  expect(adapter.sourceStateById.get('source-1')?.status).toBe('failed');
  await expect(adapter.retrySource('missing-source')).resolves.toMatchObject({
    ok: false,
    reason: 'unknown-source',
  });
  await expect(adapter.retrySource('source-1')).resolves.toEqual({
    ok: true,
    sourceId: 'source-1',
    state: 'configured',
  });
  expect(element.src).toBe('http://localhost:3000/primary.mp4');
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'loading',
    selectedInputIndex: 0,
  });
  element.dispatchEvent(new Event('loadedmetadata'));
  expect(adapter.sourceStateById.get('source-1')?.status).toBe('ready');
});

test('createHTMLMediaAdapter preserves active playback across retry and replacement reloads', async () => {
  const engine = createMediaSyncEngine();
  const element = document.createElement('video');
  const play = vi.spyOn(element, 'play').mockResolvedValue(undefined);
  vi.spyOn(element, 'pause').mockImplementation(() => {});
  vi.spyOn(element, 'load').mockImplementation(() => {});
  const adapter = createHTMLMediaAdapter({
    element,
    sources: htmlSources('/original.mp4'),
  });
  const activeLayers = engine.getActiveLayers({
    time: fromSeconds(1),
    layers: { visuals: { trackKind: 'visual', sourceId: 'source-1' } },
  });

  await adapter.seek?.(fromSeconds(1), activeLayers);
  await expect(adapter.startClock(fromSeconds(1), 1)).resolves.toBe(true);
  play.mockClear();

  await expect(adapter.retrySource('source-1')).resolves.toMatchObject({ ok: true });
  expect(play).toHaveBeenCalledOnce();

  await expect(
    adapter.replaceSource({ sourceId: 'source-1', input: '/replacement.mp4' })
  ).resolves.toMatchObject({ ok: true });
  expect(play).toHaveBeenCalledTimes(2);
});

test('createHTMLMediaAdapter resets inactive source diagnostics when retrying', async () => {
  const engine = createMediaSyncEngine();
  const element = document.createElement('video');
  vi.spyOn(element, 'pause').mockImplementation(() => {});
  const adapter = createHTMLMediaAdapter({
    element,
    sources: [
      {
        sourceId: 'source-1',
        input: '/primary.mp4',
        fallbacks: ['/fallback.mp4'],
      },
    ],
  });

  await adapter.seek?.(
    fromSeconds(1),
    engine.getActiveLayers({
      time: fromSeconds(1),
      layers: { visuals: { trackKind: 'visual', sourceId: 'source-1' } },
    })
  );
  element.dispatchEvent(new Event('error'));
  element.dispatchEvent(new Event('error'));
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'failed',
    selectedInputIndex: null,
  });
  expect(adapter.sourceStateById.get('source-1')?.attempts).toHaveLength(2);

  await adapter.seek?.(
    fromSeconds(8),
    engine.getActiveLayers({
      time: fromSeconds(8),
      layers: { visuals: { trackKind: 'visual', sourceId: 'source-1' } },
    })
  );
  expect(adapter.sourceStateById.get('source-1')?.status).toBe('idle');

  await expect(adapter.retrySource('source-1')).resolves.toEqual({
    ok: true,
    sourceId: 'source-1',
    state: 'configured',
  });
  expect(adapter.sourceStateById.get('source-1')).toEqual({
    sourceId: 'source-1',
    status: 'idle',
    selectedInputIndex: null,
    attempts: [],
    error: null,
  });
});

test('createHTMLMediaAdapter invalidates blob URLs when replacing a source', async () => {
  const engine = createMediaSyncEngine();
  const element = document.createElement('video');
  vi.spyOn(element, 'pause').mockImplementation(() => {});
  const createObjectURL = vi
    .spyOn(URL, 'createObjectURL')
    .mockReturnValueOnce('blob:first')
    .mockReturnValueOnce('blob:second');
  const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const adapter = createHTMLMediaAdapter({
    element,
    sources: htmlSources(new Blob(['first'])),
  });
  const activeLayers = engine.getActiveLayers({
    time: fromSeconds(1),
    layers: { visuals: { trackKind: 'visual', sourceId: 'source-1' } },
  });

  await adapter.seek?.(fromSeconds(1), activeLayers);
  expect(element.src).toBe('blob:first');

  await expect(
    adapter.replaceSource({ sourceId: 'source-1', input: new Blob(['second']) })
  ).resolves.toEqual({ ok: true, sourceId: 'source-1', state: 'configured' });

  expect(revokeObjectURL).toHaveBeenCalledWith('blob:first');
  expect(createObjectURL).toHaveBeenCalledTimes(2);
  expect(element.src).toBe('blob:second');

  adapter.dispose();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:second');
});

test('createHTMLMediaAdapter loads an app-resolved proxy through source replacement', async () => {
  const engine = createMediaSyncEngine();
  const element = document.createElement('video');
  vi.spyOn(element, 'pause').mockImplementation(() => {});
  const adapter = createHTMLMediaAdapter({
    element,
    sources: [
      {
        sourceId: 'source-1',
        input: '/original.mp4',
      },
    ],
  });
  const activeLayers = engine.getActiveLayers({
    time: fromSeconds(1),
    layers: { visuals: { trackKind: 'visual', sourceId: 'source-1' } },
  });

  await expect(
    adapter.replaceSource({
      sourceId: 'source-1',
      input: '/proxy.mp4',
      timing: { sourceTimeSeconds: 10, mediaTimeSeconds: 0 },
    })
  ).resolves.toEqual({ ok: true, sourceId: 'source-1', state: 'configured' });
  await adapter.seek?.(fromSeconds(1), activeLayers);

  expect(element.src).toBe('http://localhost:3000/proxy.mp4');
  expect(element.currentTime).toBe(1);
  expect(adapter.getClockTime()).toBe(1);
  expect(adapter.sourceStateById.get('source-1')?.selectedInputIndex).toBe(0);
});
