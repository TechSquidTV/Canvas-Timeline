import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { expect, test, vi } from 'vite-plus/test';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { TimelineProvider } from '#react/Provider';
import { useTimelineMediaSync, useTimelineMediaPlayback } from '#react/hooks';

import { createMediaSyncEngine } from '#react/hooks/integration/testHelpers';

const mediaSyncLayers = {
  visuals: { trackKind: 'visual', sourceId: 'source-1' },
  audio: { trackKind: 'audio', sourceId: 'source-1' },
} as const;

test('useTimelineMediaPlayback starts external playback and advances from clock time', () => {
  const engine = createMediaSyncEngine();
  let clockTime = 1;
  let tick: FrameRequestCallback | undefined;
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    tick = callback;
    return 1;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const syncLayers = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => clockTime,
        layers: mediaSyncLayers,
        syncLayers,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    expect(result.current.play()).toEqual({ ok: true });
  });

  expect(engine.getState().playing).toBe(true);
  expect(syncLayers).toHaveBeenCalledTimes(1);
  expect(syncLayers.mock.calls[0][0].activeLayers.primary.visuals?.clip.id).toBe('video-clip');

  clockTime = 2.25;
  act(() => {
    tick?.(16);
  });

  expect(engine.getState().playing).toBe(true);
  expect(engine.getTime()).toEqual(fromSeconds(2.25));

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaPlayback reports async synchronization failures and pauses', async () => {
  const engine = createMediaSyncEngine();
  let clockTime = 1;
  let tick: FrameRequestCallback | undefined;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    tick = callback;
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const syncError = new Error('decoder iterator failed');
  const onError = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => clockTime,
        layers: mediaSyncLayers,
        syncLayers: ({ reason }) =>
          reason === 'tick' ? Promise.reject(syncError) : Promise.resolve(),
        onError,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    expect(result.current.play()).toEqual({ ok: true });
  });
  clockTime = 1.5;
  act(() => {
    tick?.(16);
  });

  await waitFor(() => {
    expect(onError).toHaveBeenCalledWith(syncError);
    expect(engine.getState().playing).toBe(false);
  });
});

test('useTimelineMediaPlayback invokes one loop transition until the clock re-enters range', () => {
  const engine = createMediaSyncEngine();
  engine.setInPoint(fromSeconds(1), false);
  engine.setOutPoint(fromSeconds(4), false);
  let clockTime = 1;
  let tick: FrameRequestCallback | undefined;
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    tick = callback;
    return 1;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const onLoop = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => clockTime,
        layers: mediaSyncLayers,
        playbackOptions: { respectInOut: true },
        loop: onLoop,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    expect(result.current.play()).toEqual({ ok: true });
  });

  clockTime = 4.25;
  act(() => {
    tick?.(16);
  });
  expect(onLoop).toHaveBeenCalledTimes(1);
  expect(engine.getTime()).toEqual(fromSeconds(1));

  act(() => {
    tick?.(32);
  });
  expect(onLoop).toHaveBeenCalledTimes(1);

  clockTime = 1.25;
  act(() => {
    tick?.(48);
  });
  clockTime = 4.25;
  act(() => {
    tick?.(64);
  });
  expect(onLoop).toHaveBeenCalledTimes(2);

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync reports loop clock restart failures', async () => {
  const engine = createMediaSyncEngine();
  engine.setInPoint(fromSeconds(1), false);
  engine.setOutPoint(fromSeconds(4), false);
  let clockTime = 1;
  let tick: FrameRequestCallback | undefined;
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    tick = callback;
    return 1;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const startClock = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
  const onError = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        ready: true,
        layers: mediaSyncLayers,
        playbackOptions: { loop: true, respectInOut: true },
        adapter: {
          getClockTime: () => clockTime,
          startClock,
        },
        onError,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toMatchObject({ ok: true });
  });

  clockTime = 4.25;
  act(() => {
    tick?.(16);
  });

  await waitFor(() => {
    expect(onError).toHaveBeenCalledOnce();
  });
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({
      reason: 'loop-failed',
      message: 'Media clock could not restart after looping.',
    })
  );
  expect(engine.getState().playing).toBe(false);

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaPlayback synchronizes at most once per project frame and skips missed ticks', () => {
  const engine = createMediaSyncEngine();
  engine.setTime(fromSeconds(1.02));
  let clockTime = 1.02;
  let tick: FrameRequestCallback | undefined;
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    tick = callback;
    return 1;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const syncLayers = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        frameRate: 30,
        getClockTime: () => clockTime,
        layers: mediaSyncLayers,
        syncLayers,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    expect(result.current.play()).toEqual({ ok: true });
  });
  expect(engine.getTime()).toEqual(fromSeconds(1));
  expect(syncLayers).toHaveBeenCalledTimes(1);

  clockTime = 1.032;
  act(() => {
    tick?.(8);
  });
  expect(syncLayers).toHaveBeenCalledTimes(1);
  expect(engine.getTime()).toEqual(fromSeconds(1));

  clockTime = 1.04;
  act(() => {
    tick?.(16);
  });
  expect(syncLayers).toHaveBeenCalledTimes(2);
  expect(engine.getTime()).toEqual(fromSeconds(31 / 30));

  clockTime = 1.2;
  act(() => {
    tick?.(24);
  });
  expect(syncLayers).toHaveBeenCalledTimes(3);
  expect(engine.getTime()).toEqual(fromSeconds(1.2));

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaPlayback stops external sync when the engine is paused outside the hook', () => {
  const engine = createMediaSyncEngine();
  let clockTime = 1;
  let tick: FrameRequestCallback | undefined;
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    tick = callback;
    return 1;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const stopClock = vi.fn();
  const syncLayers = vi.fn();
  const onStatus = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => clockTime,
        stopClock,
        layers: mediaSyncLayers,
        syncLayers,
        onStatus,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    expect(result.current.play()).toEqual({ ok: true });
  });

  act(() => {
    engine.pause();
  });

  expect(stopClock).toHaveBeenCalledTimes(1);
  expect(syncLayers).toHaveBeenLastCalledWith(
    expect.objectContaining({
      reason: 'pause',
      timelineTime: fromSeconds(1),
    })
  );
  expect(onStatus).toHaveBeenLastCalledWith('paused');

  clockTime = 3;
  act(() => {
    tick?.(16);
  });

  expect(engine.getTime()).toEqual(fromSeconds(1));

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaPlayback pauses on content gaps and runs cleanup callbacks', () => {
  const engine = createMediaSyncEngine();
  let clockTime = 1;
  let tick: FrameRequestCallback | undefined;
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    tick = callback;
    return 1;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const syncLayers = vi.fn();
  const onStatus = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => clockTime,
        layers: mediaSyncLayers,
        syncLayers,
        onStatus,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    expect(result.current.play()).toEqual({ ok: true });
  });

  clockTime = 7;
  act(() => {
    tick?.(16);
  });

  expect(engine.getState().playing).toBe(false);
  expect(syncLayers).toHaveBeenLastCalledWith(
    expect.objectContaining({
      reason: 'gap',
      timelineTime: fromSeconds(7),
      activeLayers: expect.objectContaining({ hasActiveClips: false }),
    })
  );
  expect(onStatus).toHaveBeenLastCalledWith('content-gap');

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaPlayback keeps playing while only the audio layer remains active', () => {
  const engine = createMediaSyncEngine();
  engine.moveClip({ clipId: 'video-clip', startTime: fromSeconds(6) });
  let clockTime = 1;
  let tick: FrameRequestCallback | undefined;
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    tick = callback;
    return 1;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const syncLayers = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => clockTime,
        layers: mediaSyncLayers,
        syncLayers,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    expect(result.current.play()).toEqual({ ok: true });
  });

  expect(engine.getState().playing).toBe(true);
  expect(syncLayers).toHaveBeenCalledTimes(1);
  expect(syncLayers.mock.calls[0][0].activeLayers.primary.visuals).toBeUndefined();
  expect(syncLayers.mock.calls[0][0].activeLayers.primary.audio?.clip.id).toBe('audio-clip');

  clockTime = 1.25;
  act(() => {
    tick?.(16);
  });

  expect(engine.getState().playing).toBe(true);
  expect(syncLayers).toHaveBeenCalledTimes(2);

  clockTime = 1.5;
  act(() => {
    tick?.(32);
  });

  expect(engine.getState().playing).toBe(true);
  expect(syncLayers).toHaveBeenCalledTimes(3);

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaPlayback reports updated layers when a clip sync key changes', () => {
  const engine = createMediaSyncEngine();
  let clockTime = 1;
  let tick: FrameRequestCallback | undefined;
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    tick = callback;
    return 1;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const syncLayers = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => clockTime,
        layers: { audio: mediaSyncLayers.audio },
        syncLayers,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    expect(result.current.play()).toEqual({ ok: true });
  });
  expect(syncLayers).toHaveBeenCalledTimes(1);

  act(() => {
    engine.slipClip('audio-clip', fromSeconds(0.5));
  });

  clockTime = 1.5;
  act(() => {
    tick?.(16);
  });

  expect(syncLayers).toHaveBeenCalledTimes(2);
  expect(syncLayers.mock.calls[1][0].activeLayers.primary.audio?.clip.id).toBe('audio-clip');
  expect(syncLayers.mock.calls[1][0].reason).toBe('tick');

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaPlayback updates playback rate and resyncs media', () => {
  const engine = createMediaSyncEngine();
  const syncLayers = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => 1,
        layers: { audio: mediaSyncLayers.audio },
        syncLayers,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    expect(result.current.setPlaybackRate(2)).toEqual({ ok: true });
  });

  expect(engine.getPlaybackRate()).toBe(2);
  expect(syncLayers).toHaveBeenLastCalledWith(
    expect.objectContaining({
      reason: 'rate',
      timelineTime: fromSeconds(1),
    })
  );
});

test('useTimelineMediaPlayback returns command failures for content gaps', () => {
  const engine = createMediaSyncEngine();
  engine.setTime(fromSeconds(8));
  const syncLayers = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => 8,
        layers: mediaSyncLayers,
        syncLayers,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    expect(result.current.play()).toEqual({ ok: false, reason: 'content-gap' });
  });

  expect(engine.getState().playing).toBe(false);
  expect(syncLayers).toHaveBeenLastCalledWith(
    expect.objectContaining({
      reason: 'gap',
      timelineTime: fromSeconds(8),
      activeLayers: expect.objectContaining({ hasActiveClips: false }),
    })
  );
});

test('useTimelineMediaSync seeks to first media and starts an external adapter clock', async () => {
  const engine = createMediaSyncEngine();
  engine.setTime(fromSeconds(8));
  let clockTime = 0;
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const startClock = vi.fn((timelineTime) => {
    clockTime = toSeconds(timelineTime);
    return true;
  });
  const requestClockActivation = vi.fn();
  const seek = vi.fn();
  const syncLayers = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
          audio: { trackKind: 'audio', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => clockTime,
          startClock,
          requestClockActivation,
          seek,
          syncLayers,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({ ok: true, time: fromSeconds(0) });
  });

  expect(engine.getTime()).toEqual(fromSeconds(0));
  expect(seek).toHaveBeenCalledWith(
    fromSeconds(0),
    expect.objectContaining({ hasActiveClips: true })
  );
  expect(startClock).toHaveBeenCalledWith(fromSeconds(0), 1);
  expect(requestClockActivation).toHaveBeenCalledWith(1);
  expect(syncLayers).toHaveBeenCalledWith(
    expect.objectContaining({
      reason: 'play',
      timelineTime: fromSeconds(0),
      activeLayers: expect.objectContaining({
        primary: expect.objectContaining({
          visuals: expect.objectContaining({ clip: expect.objectContaining({ id: 'video-clip' }) }),
        }),
      }),
    })
  );

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test.each([
  ['time-continuous', undefined],
  ['frame-locked', 30],
] as const)(
  'useTimelineMediaSync does not emit a redundant scrub at the current playback time (%s)',
  async (_mode, frameRate) => {
    const engine = createMediaSyncEngine();
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const playheadScrub = vi.fn();
    const unsubscribe = engine.on('playhead:scrub', playheadScrub);

    const { result } = renderHook(
      () =>
        useTimelineMediaSync({
          frameRate,
          layers: mediaSyncLayers,
          adapter: {
            getClockTime: () => 1,
            startClock: () => true,
          },
        }),
      {
        wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
      }
    );

    await act(async () => {
      await expect(result.current.play()).resolves.toEqual({ ok: true, time: fromSeconds(1) });
    });

    expect(playheadScrub).not.toHaveBeenCalled();

    unsubscribe();
    rafSpy.mockRestore();
    cancelSpy.mockRestore();
  }
);

test('useTimelineMediaSync stops the adapter clock when paused', async () => {
  const engine = createMediaSyncEngine();
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const startClock = vi.fn(() => true);
  const stopClock = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock,
          stopClock,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({ ok: true, time: fromSeconds(1) });
  });

  act(() => {
    expect(result.current.pause()).toEqual({ ok: true });
  });

  expect(startClock).toHaveBeenCalledWith(fromSeconds(1), 1);
  expect(stopClock).toHaveBeenCalledTimes(1);
  expect(engine.getState().playing).toBe(false);

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync reports missing media and does not start playback', async () => {
  const engine = new TimelineEngine({ tracks: [] });
  const startClock = vi.fn(() => true);
  const onError = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual' },
        },
        adapter: {
          getClockTime: () => 0,
          startClock,
        },
        onError,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({
      ok: false,
      reason: 'no-content',
      message: 'No timeline content is available.',
    });
  });

  expect(startClock).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({ reason: 'no-content', message: 'No timeline content is available.' })
  );
});

test('useTimelineMediaSync reports not-ready adapters without starting playback', async () => {
  const engine = createMediaSyncEngine();
  const startClock = vi.fn(() => true);
  const onError = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        ready: false,
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 0,
          startClock,
        },
        onError,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({
      ok: false,
      reason: 'not-ready',
      message: 'Media adapter is not ready.',
    });
  });

  expect(startClock).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({ reason: 'not-ready', message: 'Media adapter is not ready.' })
  );
});

test('useTimelineMediaSync awaits async clock startup failures', async () => {
  const engine = createMediaSyncEngine();
  const startClock = vi.fn(async () => false);
  const requestClockActivation = vi.fn();
  const onError = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 0,
          startClock,
          requestClockActivation,
        },
        onError,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({
      ok: false,
      reason: 'clock-failed',
      message: 'Media clock could not start.',
    });
  });

  expect(requestClockActivation).toHaveBeenCalledWith(1);
  expect(startClock).toHaveBeenCalledWith(fromSeconds(1), 1);
  expect(engine.getState().playing).toBe(false);
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({ reason: 'clock-failed', message: 'Media clock could not start.' })
  );
});

test('useTimelineMediaSync converts adapter startup exceptions into a play result', async () => {
  const engine = createMediaSyncEngine();
  const startClock = vi.fn(() => {
    throw new Error('blocked');
  });
  const stopClock = vi.fn();
  const onError = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 0,
          startClock,
          stopClock,
        },
        onError,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({
      ok: false,
      reason: 'clock-failed',
      message: 'Media clock could not start. blocked',
      cause: expect.any(Error),
    });
  });

  expect(startClock).toHaveBeenCalledWith(fromSeconds(1), 1);
  expect(stopClock).toHaveBeenCalled();
  expect(engine.getState().playing).toBe(false);
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({
      reason: 'clock-failed',
      message: 'Media clock could not start. blocked',
    })
  );
});

test('useTimelineMediaSync converts timeline sync exceptions into a play result', async () => {
  const engine = createMediaSyncEngine();
  const startClock = vi.fn(() => true);
  const stopClock = vi.fn();
  const onError = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 0,
          startClock,
          stopClock,
          syncLayers: () => {
            throw new Error('render failed');
          },
        },
        onError,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({
      ok: false,
      reason: 'sync-failed',
      message: 'Media synchronization failed. render failed',
      cause: expect.any(Error),
    });
  });

  expect(startClock).toHaveBeenCalledWith(fromSeconds(1), 1);
  expect(stopClock).toHaveBeenCalled();
  expect(engine.getState().playing).toBe(false);
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({
      reason: 'sync-failed',
      message: 'Media synchronization failed. render failed',
    })
  );
});

test('useTimelineMediaSync forwards playback rate changes to the adapter', () => {
  const engine = createMediaSyncEngine();
  const setClockRate = vi.fn();
  const syncLayers = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          audio: { trackKind: 'audio', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock: () => true,
          setClockRate,
          syncLayers,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    expect(result.current.setPlaybackRate(2)).toEqual({ ok: true });
  });

  expect(setClockRate).toHaveBeenCalledWith(2);
  expect(engine.getPlaybackRate()).toBe(2);
  expect(syncLayers).toHaveBeenLastCalledWith(
    expect.objectContaining({
      reason: 'rate',
      timelineTime: fromSeconds(1),
    })
  );
});

test('useTimelineMediaSync seeks paused preview on initial ready mount', () => {
  const engine = createMediaSyncEngine();
  let previewTick: FrameRequestCallback | undefined;
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    previewTick = callback;
    return 1;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const seek = vi.fn();

  renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock: () => true,
          seek,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(rafSpy).toHaveBeenCalledTimes(1);
  expect(seek).not.toHaveBeenCalled();

  act(() => {
    previewTick?.(16);
  });

  expect(seek).toHaveBeenCalledWith(
    fromSeconds(1),
    expect.objectContaining({
      primary: expect.objectContaining({
        visuals: expect.objectContaining({ clip: expect.objectContaining({ id: 'video-clip' }) }),
      }),
    })
  );

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync schedules initial paused preview when adapter becomes ready', () => {
  const engine = createMediaSyncEngine();
  let ready = false;
  const previewTicks: FrameRequestCallback[] = [];
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    previewTicks.push(callback);
    return previewTicks.length;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const seek = vi.fn();

  const { rerender } = renderHook(
    () =>
      useTimelineMediaSync({
        ready,
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock: () => true,
          seek,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(rafSpy).not.toHaveBeenCalled();

  ready = true;
  rerender();

  expect(rafSpy).toHaveBeenCalledTimes(1);

  act(() => {
    previewTicks[0]?.(16);
  });

  expect(seek).toHaveBeenCalledTimes(1);

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync refreshes paused preview when a clip move changes active layers', () => {
  const engine = createMediaSyncEngine();
  let previewTick: FrameRequestCallback | undefined;
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    previewTick = callback;
    return 1;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const seek = vi.fn();

  renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
          audio: { trackKind: 'audio', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock: () => true,
          seek,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    engine.moveClip({ clipId: 'video-clip', startTime: fromSeconds(6) });
  });

  expect(seek).not.toHaveBeenCalled();

  act(() => {
    previewTick?.(16);
  });

  expect(seek).toHaveBeenCalledTimes(1);
  expect(seek.mock.calls[0][0]).toEqual(fromSeconds(1));
  expect(seek.mock.calls[0][1].primary.visuals).toBeUndefined();
  expect(seek.mock.calls[0][1].primary.audio?.clip.id).toBe('audio-clip');

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync skips paused preview seeks until the adapter is ready', () => {
  const engine = createMediaSyncEngine();
  let ready = false;
  const previewTicks: FrameRequestCallback[] = [];
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    previewTicks.push(callback);
    return previewTicks.length;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const seek = vi.fn();

  const { rerender } = renderHook(
    () =>
      useTimelineMediaSync({
        ready,
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
          audio: { trackKind: 'audio', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock: () => true,
          seek,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    engine.moveClip({ clipId: 'video-clip', startTime: fromSeconds(6) });
  });

  expect(rafSpy).not.toHaveBeenCalled();
  expect(seek).not.toHaveBeenCalled();

  ready = true;
  rerender();

  act(() => {
    engine.moveClip({ clipId: 'video-clip', startTime: fromSeconds(7) });
  });

  expect(rafSpy).toHaveBeenCalledTimes(1);

  act(() => {
    previewTicks[0]?.(16);
  });

  expect(seek).toHaveBeenCalledTimes(1);

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync skips a queued paused preview seek if the adapter becomes unready', () => {
  const engine = createMediaSyncEngine();
  let ready = true;
  const previewTicks: FrameRequestCallback[] = [];
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    previewTicks.push(callback);
    return previewTicks.length;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const seek = vi.fn();

  const { rerender } = renderHook(
    () =>
      useTimelineMediaSync({
        ready,
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
          audio: { trackKind: 'audio', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock: () => true,
          seek,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    engine.moveClip({ clipId: 'video-clip', startTime: fromSeconds(6) });
  });

  expect(rafSpy).toHaveBeenCalledTimes(1);

  ready = false;
  rerender();

  act(() => {
    previewTicks[0]?.(16);
  });

  expect(seek).not.toHaveBeenCalled();

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync coalesces initial and media edit events into one paused preview seek', () => {
  const engine = createMediaSyncEngine();
  const previewTicks: FrameRequestCallback[] = [];
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    previewTicks.push(callback);
    return previewTicks.length;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const seek = vi.fn();

  renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
          audio: { trackKind: 'audio', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock: () => true,
          seek,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    engine.moveClip({ clipId: 'video-clip', startTime: fromSeconds(6) });
    engine.moveClip({ clipId: 'video-clip', startTime: fromSeconds(7) });
    engine.slipClip('audio-clip', fromSeconds(0.5));
  });

  expect(rafSpy).toHaveBeenCalledTimes(1);

  act(() => {
    previewTicks[0]?.(16);
  });

  expect(seek).toHaveBeenCalledTimes(1);

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync skips paused preview seeks while playback is active', () => {
  const engine = createMediaSyncEngine();
  engine.play({ clock: 'external' });
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const seek = vi.fn();

  renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
          audio: { trackKind: 'audio', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock: () => true,
          seek,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    engine.moveClip({ clipId: 'video-clip', startTime: fromSeconds(6) });
  });

  expect(rafSpy).not.toHaveBeenCalled();
  expect(seek).not.toHaveBeenCalled();

  act(() => {
    engine.pause();
  });
  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});
