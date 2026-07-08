import { expect, test, vi } from 'vite-plus/test';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { TimelineProvider } from '@techsquidtv/canvas-timeline-react';
import {
  createHTMLMediaAdapter,
  useHTMLMediaAdapter,
  useHTMLTimelineMedia,
} from '#html-media-adapter/index';

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
    sources: {
      'source-1': '/sample.mp4',
    },
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
    sources: {
      'source-1': 'sample.mp4',
    },
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

test('createHTMLMediaAdapter disposes object URLs for blob sources', async () => {
  const engine = createMediaSyncEngine();
  const element = document.createElement('video');
  vi.spyOn(element, 'pause').mockImplementation(() => {});
  const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:sample');
  const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const adapter = createHTMLMediaAdapter({
    element,
    sources: {
      'source-1': new Blob(['sample']),
    },
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
    sources: {
      'source-1': '/sample.mp4',
    },
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
    sources: {
      'source-1': '/sample.mp4',
    },
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

test('createHTMLMediaAdapter clears the element for missing sources and content gaps', async () => {
  const engine = createMediaSyncEngine();
  const element = document.createElement('video');
  const pause = vi.spyOn(element, 'pause').mockImplementation(() => {});
  const load = vi.spyOn(element, 'load').mockImplementation(() => {});
  const adapter = createHTMLMediaAdapter({
    element,
    sources: {},
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
    sources: {
      'source-1': '/sample.mp4',
    },
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
    sources: {
      'source-1': '/sample.mp4',
    },
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

test('useHTMLMediaAdapter exposes a noop until the ref connects and disposes on unmount', async () => {
  const ref = { current: null as HTMLMediaElement | null };
  const initial = renderHook(() =>
    useHTMLMediaAdapter({
      ref,
      sources: {
        'source-1': '/sample.mp4',
      },
    })
  );

  expect(initial.result.current.ready).toBe(false);
  expect(initial.result.current.adapter.startClock(fromSeconds(1), 1)).toBe(false);
  initial.unmount();

  const element = document.createElement('video');
  const pause = vi.spyOn(element, 'pause').mockImplementation(() => {});
  ref.current = element;
  const connected = renderHook(() =>
    useHTMLMediaAdapter({
      ref,
      sources: {
        'source-1': '/sample.mp4',
      },
    })
  );

  await waitFor(() => {
    expect(connected.result.current.ready).toBe(true);
  });
  connected.unmount();

  expect(pause).toHaveBeenCalled();
});

test('useHTMLTimelineMedia creates an adapter and exposes synchronized transport', async () => {
  const engine = createMediaSyncEngine();
  engine.setTime(fromSeconds(8));
  const element = document.createElement('video');
  const play = vi.spyOn(element, 'play').mockResolvedValue(undefined);
  const pause = vi.spyOn(element, 'pause').mockImplementation(() => {});
  const ref = { current: element };
  const layers = {
    visuals: { trackKind: 'visual', sourceId: 'source-1' },
  } as const;

  const { result } = renderHook(
    () =>
      useHTMLTimelineMedia({
        ref,
        sources: {
          'source-1': '/sample.mp4',
        },
        layers,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await waitFor(() => {
    expect(result.current.ready).toBe(true);
  });
  expect(result.current.playbackRate).toBe(1);

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({ ok: true, time: fromSeconds(0) });
  });

  expect(play).toHaveBeenCalled();
  expect(result.current.adapter.getClockTime()).toBe(0);

  act(() => {
    expect(result.current.setPlaybackRate(1.5)).toEqual({ ok: true });
  });
  expect(element.playbackRate).toBe(1.5);

  act(() => {
    expect(result.current.pause()).toEqual({ ok: true });
  });
  expect(pause).toHaveBeenCalled();
});
