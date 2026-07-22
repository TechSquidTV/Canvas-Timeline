import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { expect, test, vi } from 'vite-plus/test';
import {
  TimelineEngine,
  TimelineMediaError,
  type TimelineMediaSyncAdapter,
} from '@techsquidtv/canvas-timeline-core';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { TimelineProvider } from '#react/Provider';
import * as playbackHookExports from '#react/hooks/playback';
import {
  useTimelineMediaSync,
  useTimelineMediaPlayback,
  type TimelineMediaPlayResult,
} from '#react/hooks';

import { createMediaSyncEngine } from '#react/hooks/integration/testHelpers';

const mediaSyncLayers = {
  visuals: { trackKind: 'visual', sourceId: 'source-1' },
  audio: { trackKind: 'audio', sourceId: 'source-1' },
} as const;

test('playback hook exports exclude delegated synchronization internals', () => {
  expect(playbackHookExports).not.toHaveProperty('delegateTimelineMediaPlaybackSynchronization');
  expect(playbackHookExports).not.toHaveProperty('useTimelineMediaPlaybackInternal');
});

test('useTimelineMediaPlayback starts external playback and advances from clock time', async () => {
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

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({ ok: true });
  });

  expect(engine.getState().playing).toBe(true);
  expect(syncLayers).toHaveBeenCalledTimes(1);
  expect(syncLayers.mock.calls[0][0].activeLayers.primary.visuals?.clip.id).toBe('video-clip');

  clockTime = 2.25;
  await act(async () => {
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
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    tick = callback;
    return 1;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
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

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({ ok: true });
  });
  clockTime = 1.5;
  await act(async () => {
    tick?.(16);
  });

  await waitFor(() => {
    expect(onError).toHaveBeenCalledWith(syncError);
    expect(engine.getState().playing).toBe(false);
  });

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaPlayback awaits startup synchronization before reporting success', async () => {
  const engine = createMediaSyncEngine();
  const syncError = new Error('startup render failed');
  const onError = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => 1,
        layers: mediaSyncLayers,
        syncLayers: () => Promise.reject(syncError),
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
      message: 'External media synchronization failed.',
      cause: syncError,
    });
  });

  expect(engine.getState().playing).toBe(false);
  expect(onError).toHaveBeenCalledWith(syncError);
});

test('useTimelineMediaPlayback serializes asynchronous ticks', async () => {
  const engine = createMediaSyncEngine();
  let clockTime = 1;
  let tick: FrameRequestCallback | undefined;
  let resolveTickSynchronization = () => {};
  const tickSynchronization = new Promise<void>((resolve) => {
    resolveTickSynchronization = resolve;
  });
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    tick = callback;
    return rafSpy.mock.calls.length;
  });
  const syncLayers = vi.fn(({ reason }: { reason: string }) =>
    reason === 'tick' ? tickSynchronization : Promise.resolve()
  );

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

  await act(async () => {
    await result.current.play();
  });
  const scheduledFramesAfterPlay = rafSpy.mock.calls.length;

  clockTime = 1.5;
  await act(async () => {
    tick?.(16);
  });
  expect(syncLayers).toHaveBeenCalledTimes(2);
  expect(rafSpy).toHaveBeenCalledTimes(scheduledFramesAfterPlay);

  await act(async () => {
    resolveTickSynchronization();
  });
  expect(rafSpy).toHaveBeenCalledTimes(scheduledFramesAfterPlay + 1);

  rafSpy.mockRestore();
});

test('useTimelineMediaPlayback orders paused cleanup after an in-flight tick', async () => {
  const engine = createMediaSyncEngine();
  let clockTime = 1;
  let tick: FrameRequestCallback | undefined;
  let resolveTickSynchronization = () => {};
  const tickSynchronization = new Promise<void>((resolve) => {
    resolveTickSynchronization = resolve;
  });
  const reasons: string[] = [];
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    tick = callback;
    return 1;
  });
  const syncLayers = vi.fn(async ({ reason }: { reason: string }) => {
    reasons.push(reason);
    if (reason === 'tick') {
      await tickSynchronization;
    }
  });

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

  await act(async () => {
    await result.current.play();
  });
  clockTime = 1.5;
  await act(async () => {
    tick?.(16);
    await Promise.resolve();
  });
  expect(reasons).toEqual(['play', 'tick']);

  act(() => {
    result.current.pause();
  });
  expect(reasons).toEqual(['play', 'tick']);

  await act(async () => {
    resolveTickSynchronization();
  });
  await waitFor(() => {
    expect(reasons).toEqual(['play', 'tick', 'pause']);
  });

  rafSpy.mockRestore();
});

test('useTimelineMediaPlayback waits for loop realignment before syncing or ticking again', async () => {
  const engine = createMediaSyncEngine();
  engine.setInPoint(fromSeconds(1), false);
  engine.setOutPoint(fromSeconds(4), false);
  let clockTime = 1;
  let tick: FrameRequestCallback | undefined;
  let resolveLoop = () => {};
  const loopRealignment = new Promise<void>((resolve) => {
    resolveLoop = resolve;
  });
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    tick = callback;
    return rafSpy.mock.calls.length;
  });
  const syncLayers = vi.fn();
  const loop = vi.fn(() => loopRealignment);

  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => clockTime,
        layers: mediaSyncLayers,
        playbackOptions: { respectInOut: true },
        syncLayers,
        loop,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await result.current.play();
  });
  const scheduledFramesAfterPlay = rafSpy.mock.calls.length;
  clockTime = 4.25;
  await act(async () => {
    tick?.(16);
  });

  expect(loop).toHaveBeenCalledOnce();
  expect(syncLayers).toHaveBeenCalledTimes(1);
  expect(rafSpy).toHaveBeenCalledTimes(scheduledFramesAfterPlay);

  await act(async () => {
    resolveLoop();
  });
  expect(syncLayers).toHaveBeenCalledTimes(2);
  expect(rafSpy).toHaveBeenCalledTimes(scheduledFramesAfterPlay + 1);

  rafSpy.mockRestore();
});

test('useTimelineMediaPlayback uses current content after loop realignment', async () => {
  const engine = createMediaSyncEngine();
  engine.setInPoint(fromSeconds(1), false);
  engine.setOutPoint(fromSeconds(4), false);
  let clockTime = 1;
  let tick: FrameRequestCallback | undefined;
  let resolveLoop = () => {};
  const loopRealignment = new Promise<void>((resolve) => {
    resolveLoop = resolve;
  });
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
        playbackOptions: { respectInOut: true },
        syncLayers,
        loop: () => loopRealignment,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await result.current.play();
  });
  clockTime = 4.25;
  act(() => {
    tick?.(16);
  });
  await vi.waitFor(() => {
    expect(syncLayers).toHaveBeenCalledOnce();
  });

  act(() => {
    engine.moveClip({ clipId: 'video-clip', startTime: fromSeconds(6) });
    engine.moveClip({ clipId: 'audio-clip', startTime: fromSeconds(6) });
  });
  await act(async () => {
    resolveLoop();
  });

  expect(syncLayers).toHaveBeenCalledWith(
    expect.objectContaining({
      reason: 'tick',
      activeLayers: expect.objectContaining({ hasActiveClips: false }),
    })
  );
  expect(engine.getState().playing).toBe(false);

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaPlayback reports loop realignment failures', async () => {
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
  const loopError = new Error('clock realignment failed');
  const onError = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => clockTime,
        layers: mediaSyncLayers,
        playbackOptions: { respectInOut: true },
        loop: () => Promise.reject(loopError),
        onError,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({ ok: true });
  });
  clockTime = 4.25;
  await act(async () => {
    tick?.(16);
  });

  expect(onError).toHaveBeenCalledWith(loopError);
  expect(engine.getState().playing).toBe(false);

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaPlayback invokes one loop transition until the clock re-enters range', async () => {
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

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({ ok: true });
  });

  clockTime = 4.25;
  await act(async () => {
    tick?.(16);
  });
  expect(onLoop).toHaveBeenCalledTimes(1);
  expect(engine.getTime()).toEqual(fromSeconds(1));

  await act(async () => {
    tick?.(32);
  });
  expect(onLoop).toHaveBeenCalledTimes(1);

  clockTime = 1.25;
  await act(async () => {
    tick?.(48);
  });
  clockTime = 4.25;
  await act(async () => {
    tick?.(64);
  });
  expect(onLoop).toHaveBeenCalledTimes(2);

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaPlayback keeps loop policy fixed for each playback run', async () => {
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
  const onLoop = vi.fn(() => {
    clockTime = 1;
  });

  const { result, rerender } = renderHook(
    ({ loop }: { loop: boolean }) =>
      useTimelineMediaPlayback({
        getClockTime: () => clockTime,
        layers: mediaSyncLayers,
        playbackOptions: { respectInOut: true },
        ...(loop && { loop: onLoop }),
      }),
    {
      initialProps: { loop: true },
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({ ok: true });
  });
  rerender({ loop: false });

  clockTime = 4.25;
  await act(async () => {
    tick?.(16);
  });
  expect(onLoop).toHaveBeenCalledOnce();
  expect(engine.getState().playing).toBe(true);
  expect(engine.getTime()).toEqual(fromSeconds(1));

  act(() => {
    result.current.pause();
  });
  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({ ok: true });
  });
  clockTime = 4.25;
  await act(async () => {
    tick?.(32);
  });

  expect(onLoop).toHaveBeenCalledOnce();
  expect(engine.getState().playing).toBe(false);
  expect(engine.getTime()).toEqual(fromSeconds(4));

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
  await act(async () => {
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

test('useTimelineMediaSync does not restart a loop clock after playback pauses', async () => {
  const engine = createMediaSyncEngine();
  engine.setInPoint(fromSeconds(1), false);
  engine.setOutPoint(fromSeconds(4), false);
  let clockTime = 1;
  let tick: FrameRequestCallback | undefined;
  let resolveLoopSeek = () => {};
  const loopSeek = new Promise<void>((resolve) => {
    resolveLoopSeek = resolve;
  });
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    tick = callback;
    return 1;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const seek = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockImplementationOnce(() => loopSeek);
  const startClock = vi.fn(() => true);
  const stopClock = vi.fn();
  const onError = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: mediaSyncLayers,
        playbackOptions: { loop: true, respectInOut: true },
        adapter: {
          getClockTime: () => clockTime,
          startClock,
          stopClock,
          seek,
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
    expect(seek).toHaveBeenCalledTimes(2);
  });

  act(() => {
    result.current.pause();
  });
  resolveLoopSeek();
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(startClock).toHaveBeenCalledTimes(1);
  expect(stopClock).toHaveBeenCalledTimes(1);
  expect(engine.getState().playing).toBe(false);
  expect(onError).not.toHaveBeenCalled();

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaPlayback synchronizes at most once per project frame and skips missed ticks', async () => {
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

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({ ok: true });
  });
  expect(engine.getTime()).toEqual(fromSeconds(1));
  expect(syncLayers).toHaveBeenCalledTimes(1);

  clockTime = 1.032;
  await act(async () => {
    tick?.(8);
  });
  expect(syncLayers).toHaveBeenCalledTimes(1);
  expect(engine.getTime()).toEqual(fromSeconds(1));

  clockTime = 1.04;
  await act(async () => {
    tick?.(16);
  });
  expect(syncLayers).toHaveBeenCalledTimes(2);
  expect(engine.getTime()).toEqual(fromSeconds(31 / 30));

  clockTime = 1.2;
  await act(async () => {
    tick?.(24);
  });
  expect(syncLayers).toHaveBeenCalledTimes(3);
  expect(engine.getTime()).toEqual(fromSeconds(1.2));

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaPlayback stops external sync when the engine is paused outside the hook', async () => {
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

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({ ok: true });
  });

  await act(async () => {
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

test('useTimelineMediaPlayback does not pause a competing clock when it unmounts', () => {
  const engine = createMediaSyncEngine();
  const stopClock = vi.fn();
  const syncLayers = vi.fn();
  const { unmount } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => 1,
        layers: mediaSyncLayers,
        stopClock,
        syncLayers,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    expect(engine.play({ clock: 'external' })).toBe(true);
  });
  unmount();

  expect(engine.getState().playing).toBe(true);
  expect(stopClock).not.toHaveBeenCalled();
  expect(syncLayers).not.toHaveBeenCalled();

  act(() => {
    engine.pause();
  });
});

test('useTimelineMediaPlayback cancels pending media startup without pausing a competing clock', async () => {
  const engine = createMediaSyncEngine();
  const stopClock = vi.fn();
  let resolveStartup = () => {};
  const startup = new Promise<void>((resolve) => {
    resolveStartup = resolve;
  });
  const syncLayers = vi.fn(({ reason }: { reason: string }) =>
    reason === 'play' ? startup : Promise.resolve()
  );
  const { result, unmount } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => 1,
        layers: mediaSyncLayers,
        stopClock,
        syncLayers,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  const pendingPlay = result.current.play();
  await waitFor(() => {
    expect(syncLayers).toHaveBeenCalledWith(expect.objectContaining({ reason: 'play' }));
  });
  act(() => {
    expect(engine.play({ clock: 'external' })).toBe(true);
  });
  unmount();

  expect(engine.getState().playing).toBe(true);
  expect(stopClock).toHaveBeenCalledTimes(1);

  resolveStartup();
  await expect(pendingPlay).resolves.toMatchObject({
    ok: false,
    reason: 'policy-rejected',
  });
  act(() => {
    engine.pause();
  });
});

test('useTimelineMediaPlayback pauses on content gaps and runs cleanup callbacks', async () => {
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

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({ ok: true });
  });

  clockTime = 7;
  await act(async () => {
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

test('useTimelineMediaPlayback keeps playing while only the audio layer remains active', async () => {
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

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({ ok: true });
  });

  expect(engine.getState().playing).toBe(true);
  expect(syncLayers).toHaveBeenCalledTimes(1);
  expect(syncLayers.mock.calls[0][0].activeLayers.primary.visuals).toBeUndefined();
  expect(syncLayers.mock.calls[0][0].activeLayers.primary.audio?.clip.id).toBe('audio-clip');

  clockTime = 1.25;
  await act(async () => {
    tick?.(16);
  });

  expect(engine.getState().playing).toBe(true);
  expect(syncLayers).toHaveBeenCalledTimes(2);

  clockTime = 1.5;
  await act(async () => {
    tick?.(32);
  });

  expect(engine.getState().playing).toBe(true);
  expect(syncLayers).toHaveBeenCalledTimes(3);

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaPlayback reports updated layers when a clip sync key changes', async () => {
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

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({ ok: true });
  });
  expect(syncLayers).toHaveBeenCalledTimes(1);

  act(() => {
    engine.slipClip('audio-clip', fromSeconds(0.5));
  });

  clockTime = 1.5;
  await act(async () => {
    tick?.(16);
  });

  expect(syncLayers).toHaveBeenCalledTimes(2);
  expect(syncLayers.mock.calls[1][0].activeLayers.primary.audio?.clip.id).toBe('audio-clip');
  expect(syncLayers.mock.calls[1][0].reason).toBe('tick');

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaPlayback updates playback rate and resyncs media', async () => {
  const engine = createMediaSyncEngine();
  const syncLayers = vi.fn();
  const setClockRate = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => 1,
        layers: { audio: mediaSyncLayers.audio },
        setClockRate,
        syncLayers,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.setPlaybackRate(2)).resolves.toEqual({ ok: true });
  });

  expect(engine.getPlaybackRate()).toBe(2);
  expect(setClockRate).toHaveBeenCalledWith(2);
  expect(syncLayers).toHaveBeenLastCalledWith(
    expect.objectContaining({
      reason: 'rate',
      timelineTime: fromSeconds(1),
    })
  );

  await act(async () => {
    await expect(result.current.setPlaybackRate(0)).resolves.toMatchObject({
      ok: false,
      reason: 'invalid-input',
    });
  });
  expect(engine.getPlaybackRate()).toBe(2);
  expect(setClockRate).toHaveBeenCalledTimes(1);
});

test('useTimelineMediaPlayback reports a rate synchronization superseded by pause', async () => {
  const engine = createMediaSyncEngine();
  let resolveRateSynchronization = () => {};
  const rateSynchronization = new Promise<void>((resolve) => {
    resolveRateSynchronization = resolve;
  });
  const syncLayers = vi.fn(({ reason }: { reason: string }) =>
    reason === 'rate' ? rateSynchronization : Promise.resolve()
  );

  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => 1,
        layers: mediaSyncLayers,
        syncLayers,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await result.current.play();
  });
  let rateResult!: ReturnType<typeof result.current.setPlaybackRate>;
  await act(async () => {
    rateResult = result.current.setPlaybackRate(2);
    await Promise.resolve();
  });
  act(() => {
    result.current.pause();
  });
  await act(async () => {
    resolveRateSynchronization();
    await expect(rateResult).resolves.toEqual({
      ok: false,
      reason: 'policy-rejected',
      message: 'Playback rate change was superseded.',
    });
  });
});

test('useTimelineMediaPlayback returns command failures for content gaps', async () => {
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

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({
      ok: false,
      reason: 'content-gap',
    });
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

test('useTimelineMediaSync keeps initial-content fallback inside the playback range', async () => {
  const engine = new TimelineEngine({
    duration: fromSeconds(12),
    playheadTime: fromSeconds(4),
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
            id: 'before-range',
            sourceId: 'source-before',
            timelineStart: fromSeconds(0),
            timelineEnd: fromSeconds(1),
            sourceStart: fromSeconds(0),
            selected: false,
          },
          {
            id: 'inside-range',
            sourceId: 'source-inside',
            timelineStart: fromSeconds(3),
            timelineEnd: fromSeconds(5),
            sourceStart: fromSeconds(0),
            selected: false,
          },
        ],
      },
    ],
  });
  engine.setInPoint(fromSeconds(2), false);
  engine.setOutPoint(fromSeconds(4), false);
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const seek = vi.fn();
  const startClock = vi.fn(() => true);

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: { visuals: { trackKind: 'visual' } },
        adapter: {
          getClockTime: () => 3,
          startClock,
          seek,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({ ok: true, time: fromSeconds(3) });
  });

  expect(engine.getTime()).toEqual(fromSeconds(3));
  expect(seek).toHaveBeenCalledWith(
    fromSeconds(3),
    expect.objectContaining({
      primary: expect.objectContaining({
        visuals: expect.objectContaining({ clip: expect.objectContaining({ id: 'inside-range' }) }),
      }),
    })
  );
  expect(startClock).toHaveBeenCalledWith(fromSeconds(3), 1);

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync starts at In when a clip overlaps the playback boundary', async () => {
  const engine = new TimelineEngine({
    duration: fromSeconds(8),
    playheadTime: fromSeconds(4),
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
            id: 'overlaps-in',
            sourceId: 'source-overlap',
            timelineStart: fromSeconds(1),
            timelineEnd: fromSeconds(3),
            sourceStart: fromSeconds(0),
            selected: false,
          },
          {
            id: 'later-content',
            sourceId: 'source-later',
            timelineStart: fromSeconds(5),
            timelineEnd: fromSeconds(7),
            sourceStart: fromSeconds(0),
            selected: false,
          },
        ],
      },
    ],
  });
  engine.setInPoint(fromSeconds(2), false);
  engine.setOutPoint(fromSeconds(7), false);
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const seek = vi.fn();
  const startClock = vi.fn(() => true);

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: { visuals: { trackKind: 'visual' } },
        adapter: {
          getClockTime: () => 2,
          startClock,
          seek,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({ ok: true, time: fromSeconds(2) });
  });

  expect(engine.getTime()).toEqual(fromSeconds(2));
  expect(seek).toHaveBeenCalledWith(
    fromSeconds(2),
    expect.objectContaining({
      primary: expect.objectContaining({
        visuals: expect.objectContaining({ clip: expect.objectContaining({ id: 'overlaps-in' }) }),
      }),
    })
  );
  expect(startClock).toHaveBeenCalledWith(fromSeconds(2), 1);

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

test('useTimelineMediaSync waits for an in-flight paused preview before starting playback', async () => {
  const engine = createMediaSyncEngine();
  let previewTick: FrameRequestCallback | undefined;
  let resolvePreviewSeek = () => {};
  const previewSeek = new Promise<void>((resolve) => {
    resolvePreviewSeek = resolve;
  });
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    previewTick = callback;
    return 1;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const seek = vi
    .fn()
    .mockImplementationOnce(() => previewSeek)
    .mockResolvedValue(undefined);
  const startClock = vi.fn(() => true);

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock,
          seek,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    previewTick?.(16);
  });
  await waitFor(() => {
    expect(seek).toHaveBeenCalledTimes(1);
  });

  const playResult = result.current.play();
  await act(async () => {
    await Promise.resolve();
  });
  expect(startClock).not.toHaveBeenCalled();
  expect(seek).toHaveBeenCalledTimes(1);

  resolvePreviewSeek();
  await act(async () => {
    await expect(playResult).resolves.toMatchObject({ ok: true });
  });

  expect(seek).toHaveBeenCalledTimes(2);
  expect(startClock).toHaveBeenCalledTimes(1);
  act(() => {
    result.current.pause();
  });
  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync suppresses paused previews during pending startup', async () => {
  const engine = createMediaSyncEngine();
  let resolveStartupSeek = () => {};
  const startupSeek = new Promise<void>((resolve) => {
    resolveStartupSeek = resolve;
  });
  const previewTicks: FrameRequestCallback[] = [];
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    previewTicks.push(callback);
    return previewTicks.length;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  let clockRunning = false;
  const seek = vi
    .fn()
    .mockImplementationOnce(() => startupSeek)
    .mockImplementation(() => {
      clockRunning = false;
    });
  const startClock = vi.fn(() => {
    clockRunning = true;
    return true;
  });

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: mediaSyncLayers,
        adapter: {
          getClockTime: () => 1,
          startClock,
          seek,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  const playResult = result.current.play();
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(seek).toHaveBeenCalledTimes(1);

  act(() => {
    engine.moveClip({ clipId: 'audio-clip', startTime: fromSeconds(0.5) });
    previewTicks.at(-1)?.(16);
  });
  resolveStartupSeek();
  await act(async () => {
    await expect(playResult).resolves.toMatchObject({ ok: true });
  });

  expect(seek).toHaveBeenCalledTimes(1);
  expect(startClock).toHaveBeenCalledTimes(1);
  expect(clockRunning).toBe(true);

  act(() => {
    result.current.pause();
  });
  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync cancels playback while an adapter seek is pending', async () => {
  const engine = createMediaSyncEngine();
  let resolveSeek = () => {};
  const pendingSeek = new Promise<void>((resolve) => {
    resolveSeek = resolve;
  });
  const seek = vi.fn(() => pendingSeek);
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
          seek,
        },
        onError,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  let playPromise!: Promise<TimelineMediaPlayResult>;
  await act(async () => {
    playPromise = result.current.play();
    await Promise.resolve();
  });
  expect(seek).toHaveBeenCalledTimes(1);

  act(() => {
    expect(result.current.pause()).toEqual({ ok: true });
  });
  resolveSeek();

  await act(async () => {
    await expect(playPromise).resolves.toEqual({
      ok: false,
      reason: 'cancelled',
      message: 'Media playback start was cancelled.',
    });
  });

  expect(startClock).not.toHaveBeenCalled();
  expect(stopClock).toHaveBeenCalledTimes(1);
  expect(engine.getState().playing).toBe(false);
  expect(onError).not.toHaveBeenCalled();
});

test('useTimelineMediaSync cancels pending startup when readiness is lost', async () => {
  const engine = createMediaSyncEngine();
  let resolveSeek = () => {};
  const pendingSeek = new Promise<void>((resolve) => {
    resolveSeek = resolve;
  });
  const seek = vi.fn(() => pendingSeek);
  const startClock = vi.fn(() => true);
  const stopClock = vi.fn();
  const onError = vi.fn();
  const adapter: TimelineMediaSyncAdapter<'visuals'> = {
    getClockTime: () => 1,
    startClock,
    stopClock,
    seek,
  };
  const layers = {
    visuals: { trackKind: 'visual', sourceId: 'source-1' },
  } as const;

  const { result, rerender } = renderHook(
    ({ ready }: { ready: boolean }) => useTimelineMediaSync({ ready, layers, adapter, onError }),
    {
      initialProps: { ready: true },
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  const playResult = result.current.play();
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(seek).toHaveBeenCalledOnce();

  rerender({ ready: false });
  expect(stopClock).toHaveBeenCalledOnce();
  resolveSeek();
  await act(async () => {
    await expect(playResult).resolves.toEqual({
      ok: false,
      reason: 'cancelled',
      message: 'Media playback start was cancelled.',
    });
  });

  expect(startClock).not.toHaveBeenCalled();
  expect(engine.getState().playing).toBe(false);
  expect(onError).not.toHaveBeenCalled();
});

test('useTimelineMediaSync stops active playback when readiness is lost', async () => {
  const engine = createMediaSyncEngine();
  const startClock = vi.fn(() => true);
  const stopClock = vi.fn();
  const adapter: TimelineMediaSyncAdapter<'visuals'> = {
    getClockTime: () => 1,
    startClock,
    stopClock,
  };
  const layers = {
    visuals: { trackKind: 'visual', sourceId: 'source-1' },
  } as const;

  const { result, rerender } = renderHook(
    ({ ready }: { ready: boolean }) => useTimelineMediaSync({ ready, layers, adapter }),
    {
      initialProps: { ready: true },
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toMatchObject({ ok: true });
  });
  expect(engine.getState().playing).toBe(true);

  act(() => {
    rerender({ ready: false });
  });

  expect(stopClock).toHaveBeenCalledOnce();
  expect(engine.getState().playing).toBe(false);
  expect(result.current.playing).toBe(false);
});

test('useTimelineMediaSync stops the owned clock when replacement and readiness loss coincide', async () => {
  const engine = createMediaSyncEngine();
  const stopFirstClock = vi.fn();
  const stopSecondClock = vi.fn();
  const firstAdapter: TimelineMediaSyncAdapter<'visuals'> = {
    getClockTime: () => 1,
    startClock: () => true,
    stopClock: stopFirstClock,
  };
  const secondAdapter: TimelineMediaSyncAdapter<'visuals'> = {
    getClockTime: () => 1,
    startClock: () => true,
    stopClock: stopSecondClock,
  };
  const layers = {
    visuals: { trackKind: 'visual', sourceId: 'source-1' },
  } as const;

  const { result, rerender } = renderHook(
    ({ adapter, ready }: { adapter: TimelineMediaSyncAdapter<'visuals'>; ready: boolean }) =>
      useTimelineMediaSync({ ready, layers, adapter, adapterIdentity: adapter }),
    {
      initialProps: { adapter: firstAdapter, ready: true },
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toMatchObject({ ok: true });
  });

  act(() => {
    rerender({ adapter: secondAdapter, ready: false });
  });

  expect(stopFirstClock).toHaveBeenCalledOnce();
  expect(stopSecondClock).not.toHaveBeenCalled();
  expect(engine.getState().playing).toBe(false);
  expect(result.current.playing).toBe(false);
});

test('useTimelineMediaSync stops a clock that resolves after playback cancellation', async () => {
  const engine = createMediaSyncEngine();
  let resolveClockStart = (_started: boolean) => {};
  const pendingClockStart = new Promise<boolean>((resolve) => {
    resolveClockStart = resolve;
  });
  const startClock = vi.fn(() => pendingClockStart);
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

  let playPromise!: Promise<TimelineMediaPlayResult>;
  await act(async () => {
    playPromise = result.current.play();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(startClock).toHaveBeenCalledTimes(1);

  act(() => {
    expect(result.current.pause()).toEqual({ ok: true });
  });
  expect(stopClock).toHaveBeenCalledTimes(1);

  resolveClockStart(true);
  await act(async () => {
    await expect(playPromise).resolves.toEqual({
      ok: false,
      reason: 'cancelled',
      message: 'Media playback start was cancelled.',
    });
  });

  expect(stopClock).toHaveBeenCalledTimes(2);
  expect(engine.getState().playing).toBe(false);
  expect(onError).not.toHaveBeenCalled();
});

test('useTimelineMediaSync shares one pending startup across concurrent play requests', async () => {
  const engine = createMediaSyncEngine();
  let resolveClockStart = (_started: boolean) => {};
  const pendingClockStart = new Promise<boolean>((resolve) => {
    resolveClockStart = resolve;
  });
  const seek = vi.fn(() => Promise.resolve());
  const startClock = vi.fn(() => pendingClockStart);
  const stopClock = vi.fn();

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
          seek,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  const firstPlay = result.current.play();
  const secondPlay = result.current.play();
  expect(secondPlay).toBe(firstPlay);

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(seek).toHaveBeenCalledTimes(1);
  expect(startClock).toHaveBeenCalledTimes(1);

  resolveClockStart(true);
  await act(async () => {
    await expect(firstPlay).resolves.toEqual({ ok: true, time: fromSeconds(1) });
    await expect(secondPlay).resolves.toEqual({ ok: true, time: fromSeconds(1) });
  });

  expect(stopClock).not.toHaveBeenCalled();
  expect(engine.getState().playing).toBe(true);

  act(() => {
    result.current.pause();
  });
});

test('useTimelineMediaSync waits for a cancelled clock start before replaying', async () => {
  const engine = createMediaSyncEngine();
  let resolveFirstClockStart = (_started: boolean) => {};
  const firstClockStart = new Promise<boolean>((resolve) => {
    resolveFirstClockStart = resolve;
  });
  const startClock = vi
    .fn()
    .mockImplementationOnce(() => firstClockStart)
    .mockReturnValue(true);
  const stopClock = vi.fn();

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
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  const cancelledPlay = result.current.play();
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(startClock).toHaveBeenCalledTimes(1);

  act(() => {
    result.current.pause();
  });
  const replay = result.current.play();

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(startClock).toHaveBeenCalledTimes(1);

  resolveFirstClockStart(true);
  await act(async () => {
    await expect(cancelledPlay).resolves.toMatchObject({ ok: false, reason: 'cancelled' });
    await expect(replay).resolves.toEqual({ ok: true, time: fromSeconds(1) });
  });

  expect(startClock).toHaveBeenCalledTimes(2);
  expect(stopClock).toHaveBeenCalledTimes(2);
  expect(engine.getState().playing).toBe(true);

  act(() => {
    result.current.pause();
  });
});

test('useTimelineMediaSync converts activation exceptions into a play result', async () => {
  const engine = createMediaSyncEngine();
  const activationError = new Error('activation blocked');
  const requestClockActivation = vi
    .fn()
    .mockImplementationOnce(() => {
      throw activationError;
    })
    .mockReturnValue(undefined);
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
      message: 'Media clock could not start. activation blocked',
      cause: activationError,
    });
  });

  expect(startClock).not.toHaveBeenCalled();
  expect(stopClock).toHaveBeenCalledOnce();
  expect(engine.getState().playing).toBe(false);
  expect(onError).toHaveBeenCalledOnce();
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({
      reason: 'clock-failed',
      message: 'Media clock could not start. activation blocked',
      cause: activationError,
    })
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({ ok: true, time: fromSeconds(1) });
  });
  expect(startClock).toHaveBeenCalledOnce();
  expect(engine.getState().playing).toBe(true);

  act(() => {
    result.current.pause();
  });
  expect(stopClock).toHaveBeenCalledTimes(2);
});

test.each([
  ['ordinary error', new Error('blocked')],
  ['structured timeline error', new TimelineMediaError('timeline-failed', 'adapter conflict')],
] as const)(
  'useTimelineMediaSync releases ownership when startClock throws an %s',
  async (_case, startupError) => {
    const engine = createMediaSyncEngine();
    const startClock = vi
      .fn()
      .mockImplementationOnce(() => {
        throw startupError;
      })
      .mockReturnValue(true);
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
        message: `Media clock could not start. ${startupError.message}`,
        cause: startupError,
      });
    });

    expect(startClock).toHaveBeenCalledWith(fromSeconds(1), 1);
    expect(stopClock).toHaveBeenCalledOnce();
    expect(engine.getState().playing).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'clock-failed',
        message: `Media clock could not start. ${startupError.message}`,
        cause: startupError,
      })
    );

    await act(async () => {
      await expect(result.current.play()).resolves.toEqual({ ok: true, time: fromSeconds(1) });
    });
    expect(startClock).toHaveBeenCalledTimes(2);
    expect(engine.getState().playing).toBe(true);

    act(() => {
      result.current.pause();
    });
    expect(stopClock).toHaveBeenCalledTimes(2);
  }
);

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

test('useTimelineMediaSync forwards playback rate changes to the adapter', async () => {
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

  await act(async () => {
    await expect(result.current.setPlaybackRate(2)).resolves.toEqual({ ok: true });
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

test('useTimelineMediaSync applies a rate change after pending startup adapter work', async () => {
  const engine = createMediaSyncEngine();
  let resolveStartupSeek = () => {};
  const startupSeek = new Promise<void>((resolve) => {
    resolveStartupSeek = resolve;
  });
  const startClock = vi.fn(() => true);
  const setClockRate = vi.fn();
  const syncLayers = vi.fn();
  const seek = vi.fn(() => startupSeek);

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock,
          setClockRate,
          seek,
          syncLayers,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  const playResult = result.current.play();
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(seek).toHaveBeenCalledTimes(1);

  const rateResult = result.current.setPlaybackRate(2);
  expect(setClockRate).not.toHaveBeenCalled();
  resolveStartupSeek();

  await act(async () => {
    await expect(playResult).resolves.toMatchObject({ ok: true });
    await expect(rateResult).resolves.toEqual({ ok: true });
  });

  expect(startClock).toHaveBeenCalledWith(fromSeconds(1), 1);
  expect(setClockRate).toHaveBeenCalledWith(2);
  expect(syncLayers.mock.calls.map(([details]) => details.reason)).toEqual(
    expect.arrayContaining(['play', 'rate'])
  );
  expect(engine.getPlaybackRate()).toBe(2);
  act(() => {
    result.current.pause();
  });
});

test('useTimelineMediaSync keeps a rate change ahead of a later paused preview seek', async () => {
  const engine = createMediaSyncEngine();
  const previewTicks: FrameRequestCallback[] = [];
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    previewTicks.push(callback);
    return previewTicks.length;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const operations: string[] = [];
  const adapter: TimelineMediaSyncAdapter<'visuals'> = {
    getClockTime: () => 1,
    startClock: () => true,
    setClockRate: () => operations.push('set-rate'),
    seek: () => {
      operations.push('seek');
    },
    syncLayers: ({ reason }) => {
      operations.push(`sync-${reason}`);
    },
  };

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    previewTicks.shift()?.(0);
    await Promise.resolve();
  });
  operations.length = 0;

  const rateResult = result.current.setPlaybackRate(2);
  act(() => {
    engine.moveClip({ clipId: 'video-clip', startTime: fromSeconds(1.5) });
    previewTicks.shift()?.(16);
  });

  await act(async () => {
    await expect(rateResult).resolves.toEqual({ ok: true });
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(operations).toContain('seek');
  });

  expect(operations).toEqual(['set-rate', 'sync-rate', 'seek']);
  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync rejects a paused rate change superseded by readiness loss', async () => {
  const engine = createMediaSyncEngine();
  let resolveRate = () => {};
  const pendingRate = new Promise<void>((resolve) => {
    resolveRate = resolve;
  });
  const setClockRate = vi.fn();
  const syncLayers = vi.fn(({ reason }: { reason: string }) =>
    reason === 'rate' ? pendingRate : undefined
  );
  const onError = vi.fn();
  const adapter: TimelineMediaSyncAdapter<'visuals'> = {
    getClockTime: () => 1,
    startClock: () => true,
    setClockRate,
    syncLayers,
  };
  const layers = {
    visuals: { trackKind: 'visual', sourceId: 'source-1' },
  } as const;

  const { result, rerender } = renderHook(
    ({ ready }: { ready: boolean }) => useTimelineMediaSync({ adapter, layers, onError, ready }),
    {
      initialProps: { ready: true },
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  const rateResult = result.current.setPlaybackRate(2);
  await waitFor(() => {
    expect(syncLayers).toHaveBeenCalledWith(expect.objectContaining({ reason: 'rate' }));
  });

  act(() => {
    rerender({ ready: false });
  });
  resolveRate();

  await act(async () => {
    await expect(rateResult).resolves.toEqual({
      ok: false,
      reason: 'policy-rejected',
      message: 'Playback rate change was superseded.',
    });
  });

  expect(setClockRate).toHaveBeenCalledOnce();
  expect(onError).not.toHaveBeenCalled();
  expect(engine.getState().playing).toBe(false);
});

test('useTimelineMediaSync rejects a paused rate failure from a replaced adapter', async () => {
  const engine = createMediaSyncEngine();
  let rejectRate = (_error: Error) => {};
  const pendingRate = new Promise<void>((_resolve, reject) => {
    rejectRate = reject;
  });
  const staleError = new Error('replaced adapter failed');
  const firstSetClockRate = vi.fn();
  const secondSetClockRate = vi.fn();
  const onError = vi.fn();
  const firstAdapter: TimelineMediaSyncAdapter<'visuals'> = {
    getClockTime: () => 1,
    startClock: () => true,
    setClockRate: firstSetClockRate,
    syncLayers: ({ reason }) => (reason === 'rate' ? pendingRate : undefined),
  };
  const secondAdapter: TimelineMediaSyncAdapter<'visuals'> = {
    getClockTime: () => 1,
    startClock: () => true,
    setClockRate: secondSetClockRate,
  };
  const layers = {
    visuals: { trackKind: 'visual', sourceId: 'source-1' },
  } as const;

  const { result, rerender } = renderHook(
    ({ adapter }: { adapter: TimelineMediaSyncAdapter<'visuals'> }) =>
      useTimelineMediaSync({ adapter, adapterIdentity: adapter, layers, onError }),
    {
      initialProps: { adapter: firstAdapter },
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  const rateResult = result.current.setPlaybackRate(2);
  await waitFor(() => {
    expect(firstSetClockRate).toHaveBeenCalledWith(2);
  });

  act(() => {
    rerender({ adapter: secondAdapter });
  });
  rejectRate(staleError);

  await act(async () => {
    await expect(rateResult).resolves.toEqual({
      ok: false,
      reason: 'policy-rejected',
      message: 'Playback rate change was superseded.',
    });
  });

  expect(secondSetClockRate).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
  expect(engine.getState().playing).toBe(false);
});

test('useTimelineMediaSync rejects playback owned by another clock', async () => {
  const engine = createMediaSyncEngine();
  engine.play({ clock: 'external' });
  const startClock = vi.fn(() => true);
  const onError = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock,
        },
        onError,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await expect(result.current.play()).resolves.toEqual({
    ok: false,
    reason: 'timeline-failed',
    message: 'Timeline playback is already controlled by another clock.',
  });
  expect(startClock).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({
      reason: 'timeline-failed',
      message: 'Timeline playback is already controlled by another clock.',
    })
  );
  act(() => {
    engine.pause();
  });
});

test('useTimelineMediaSync rejects a competing engine clock that starts during adapter seek', async () => {
  const engine = createMediaSyncEngine();
  let resolveSeek = () => {};
  const pendingSeek = new Promise<void>((resolve) => {
    resolveSeek = resolve;
  });
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
          getClockTime: () => 1,
          startClock,
          stopClock,
          seek: () => pendingSeek,
        },
        onError,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  const playResult = result.current.play();
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(engine.play()).toBe(true);
  resolveSeek();

  await act(async () => {
    await expect(playResult).resolves.toEqual({
      ok: false,
      reason: 'timeline-failed',
      message: 'Timeline playback is already controlled by another clock.',
    });
  });

  expect(startClock).not.toHaveBeenCalled();
  expect(stopClock).toHaveBeenCalledOnce();
  expect(engine.getState().playing).toBe(true);
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({
      reason: 'timeline-failed',
      message: 'Timeline playback is already controlled by another clock.',
    })
  );
  act(() => {
    engine.pause();
  });
});

test('useTimelineMediaSync drops queued synchronization captured from a replaced adapter', async () => {
  const engine = createMediaSyncEngine();
  let clockTime = 1;
  let tick: FrameRequestCallback | undefined;
  let resolveRate = () => {};
  const pendingRate = new Promise<void>((resolve) => {
    resolveRate = resolve;
  });
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    tick = callback;
    return 1;
  });
  const firstReasons: string[] = [];
  const secondReasons: string[] = [];
  const firstAdapter: TimelineMediaSyncAdapter<'visuals'> = {
    getClockTime: () => clockTime,
    startClock: () => true,
    stopClock: vi.fn(),
    setClockRate: vi.fn(),
    syncLayers: ({ reason }) => {
      firstReasons.push(reason);
      return reason === 'rate' ? pendingRate : undefined;
    },
  };
  const secondAdapter: TimelineMediaSyncAdapter<'visuals'> = {
    getClockTime: () => clockTime,
    startClock: () => true,
    stopClock: vi.fn(),
    setClockRate: vi.fn(),
    syncLayers: ({ reason }) => {
      secondReasons.push(reason);
    },
  };
  const layers = {
    visuals: { trackKind: 'visual', sourceId: 'source-1' },
  } as const;

  const { result, rerender } = renderHook(
    ({ adapter }: { adapter: TimelineMediaSyncAdapter<'visuals'> }) =>
      useTimelineMediaSync({ adapter, adapterIdentity: adapter, layers }),
    {
      initialProps: { adapter: firstAdapter },
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toMatchObject({ ok: true });
  });
  const rateResult = result.current.setPlaybackRate(2);
  await waitFor(() => {
    expect(firstReasons).toContain('rate');
  });

  clockTime = 1.5;
  act(() => {
    tick?.(16);
    rerender({ adapter: secondAdapter });
  });
  resolveRate();

  await act(async () => {
    await rateResult;
    await Promise.resolve();
  });

  expect(firstReasons).not.toContain('tick');
  expect(secondReasons).not.toContain('tick');
  expect(engine.getState().playing).toBe(false);
  rafSpy.mockRestore();
});

test('useTimelineMediaSync retains clock ownership across inline adapter rerenders', async () => {
  const engine = createMediaSyncEngine();
  const startClock = vi.fn(() => true);
  const firstStopClock = vi.fn();
  const secondStopClock = vi.fn();
  const onError = vi.fn();

  const { result, rerender } = renderHook(
    ({ revision }: { revision: number }) => {
      void revision;
      return useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock,
          stopClock: revision === 0 ? firstStopClock : secondStopClock,
        },
        onError,
      });
    },
    {
      initialProps: { revision: 0 },
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toMatchObject({ ok: true });
  });
  rerender({ revision: 1 });
  await act(async () => {
    await expect(result.current.play()).resolves.toMatchObject({ ok: true });
  });

  expect(startClock).toHaveBeenCalledOnce();
  expect(onError).not.toHaveBeenCalled();

  act(() => {
    engine.pause();
  });
  await waitFor(() => {
    expect(result.current.playing).toBe(false);
  });
  expect(firstStopClock).not.toHaveBeenCalled();
  expect(secondStopClock).toHaveBeenCalledOnce();
  act(() => {
    engine.play({ clock: 'external' });
  });
  await expect(result.current.play()).resolves.toMatchObject({
    ok: false,
    reason: 'timeline-failed',
  });
  expect(onError).toHaveBeenCalledOnce();
  act(() => {
    engine.pause();
  });
});

test('useTimelineMediaSync completes pending startup through the latest inline facade', async () => {
  const engine = createMediaSyncEngine();
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  let resolveInitialSeek = () => {};
  const initialSeek = new Promise<void>((resolve) => {
    resolveInitialSeek = resolve;
  });
  const firstSeek = vi.fn(() => initialSeek);
  const latestSeek = vi.fn();
  const firstStartClock = vi.fn(() => true);
  const latestStartClock = vi.fn(() => true);
  const firstStopClock = vi.fn();
  const latestStopClock = vi.fn();

  const { result, rerender } = renderHook(
    ({ revision }: { revision: number }) =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          seek: revision === 0 ? firstSeek : latestSeek,
          startClock: revision === 0 ? firstStartClock : latestStartClock,
          stopClock: revision === 0 ? firstStopClock : latestStopClock,
        },
      }),
    {
      initialProps: { revision: 0 },
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  const pendingPlay = result.current.play();
  await waitFor(() => {
    expect(firstSeek).toHaveBeenCalledOnce();
  });

  rerender({ revision: 1 });
  resolveInitialSeek();
  await act(async () => {
    await expect(pendingPlay).resolves.toMatchObject({ ok: true });
  });

  expect(latestSeek).not.toHaveBeenCalled();
  expect(firstStartClock).not.toHaveBeenCalled();
  expect(latestStartClock).toHaveBeenCalledOnce();

  act(() => {
    result.current.pause();
  });
  expect(firstStopClock).not.toHaveBeenCalled();
  expect(latestStopClock).toHaveBeenCalledOnce();

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync pauses an owned clock when the adapter changes', async () => {
  const engine = createMediaSyncEngine();
  const layers = {
    visuals: { trackKind: 'visual', sourceId: 'source-1' },
  } as const;
  const stopFirstClock = vi.fn();
  const startSecondClock = vi.fn(() => true);
  const firstAdapter: TimelineMediaSyncAdapter<'visuals'> = {
    getClockTime: () => 1,
    startClock: () => true,
    stopClock: stopFirstClock,
  };
  const secondAdapter: TimelineMediaSyncAdapter<'visuals'> = {
    getClockTime: () => 1,
    startClock: startSecondClock,
    stopClock: vi.fn(),
  };

  const { result, rerender } = renderHook(
    ({ adapter }: { adapter: TimelineMediaSyncAdapter<'visuals'> }) =>
      useTimelineMediaSync({ layers, adapter, adapterIdentity: adapter }),
    {
      initialProps: { adapter: firstAdapter },
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toMatchObject({ ok: true });
  });
  expect(engine.getState().playing).toBe(true);

  rerender({ adapter: secondAdapter });
  await waitFor(() => {
    expect(stopFirstClock).toHaveBeenCalled();
    expect(engine.getState().playing).toBe(false);
  });

  await act(async () => {
    await expect(result.current.play()).resolves.toMatchObject({ ok: true });
  });
  expect(startSecondClock).toHaveBeenCalled();
  act(() => {
    result.current.pause();
  });
});

test('useTimelineMediaSync cancels pending startup when the adapter changes', async () => {
  const engine = createMediaSyncEngine();
  const layers = {
    visuals: { trackKind: 'visual', sourceId: 'source-1' },
  } as const;
  let resolveFirstClock = (_started: boolean) => {};
  const firstClockStart = new Promise<boolean>((resolve) => {
    resolveFirstClock = resolve;
  });
  const stopFirstClock = vi.fn();
  const firstAdapter: TimelineMediaSyncAdapter<'visuals'> = {
    getClockTime: () => 1,
    startClock: () => firstClockStart,
    stopClock: stopFirstClock,
  };
  const secondAdapter: TimelineMediaSyncAdapter<'visuals'> = {
    getClockTime: () => 1,
    startClock: () => true,
    stopClock: vi.fn(),
  };

  const { result, rerender } = renderHook(
    ({ adapter }: { adapter: TimelineMediaSyncAdapter<'visuals'> }) =>
      useTimelineMediaSync({ layers, adapter, adapterIdentity: adapter }),
    {
      initialProps: { adapter: firstAdapter },
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  const pendingPlay = result.current.play();
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  rerender({ adapter: secondAdapter });
  await waitFor(() => expect(stopFirstClock).toHaveBeenCalled());

  await act(async () => {
    resolveFirstClock(true);
    await expect(pendingPlay).resolves.toEqual({
      ok: false,
      reason: 'cancelled',
      message: 'Media playback start was cancelled.',
    });
  });
  expect(engine.getState().playing).toBe(false);
});

test('useTimelineMediaSync does not stop a replacement during pending startup synchronization', async () => {
  const engine = createMediaSyncEngine();
  const layers = {
    visuals: { trackKind: 'visual', sourceId: 'source-1' },
  } as const;
  let resolveFirstSynchronization = () => {};
  const firstSynchronization = new Promise<void>((resolve) => {
    resolveFirstSynchronization = resolve;
  });
  const stopFirstClock = vi.fn();
  const stopSecondClock = vi.fn();
  const firstSyncLayers = vi.fn(({ reason }: { reason: string }) =>
    reason === 'play' ? firstSynchronization : Promise.resolve()
  );
  const firstAdapter: TimelineMediaSyncAdapter<'visuals'> = {
    getClockTime: () => 1,
    startClock: () => true,
    stopClock: stopFirstClock,
    syncLayers: firstSyncLayers,
  };
  const secondAdapter: TimelineMediaSyncAdapter<'visuals'> = {
    getClockTime: () => 1,
    startClock: () => true,
    stopClock: stopSecondClock,
  };

  const { result, rerender } = renderHook(
    ({ adapter }: { adapter: TimelineMediaSyncAdapter<'visuals'> }) =>
      useTimelineMediaSync({ layers, adapter, adapterIdentity: adapter }),
    {
      initialProps: { adapter: firstAdapter },
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  const pendingPlay = result.current.play();
  await waitFor(() => {
    expect(firstSyncLayers).toHaveBeenCalledWith(expect.objectContaining({ reason: 'play' }));
  });

  rerender({ adapter: secondAdapter });
  expect(stopFirstClock).toHaveBeenCalledOnce();
  expect(stopSecondClock).not.toHaveBeenCalled();

  resolveFirstSynchronization();
  await act(async () => {
    await expect(pendingPlay).resolves.toMatchObject({ ok: false, reason: 'cancelled' });
  });
  expect(stopFirstClock).toHaveBeenCalledOnce();
  expect(stopSecondClock).not.toHaveBeenCalled();
  expect(engine.getState().playing).toBe(false);
});

test('useTimelineMediaSync seeks paused preview on initial ready mount', async () => {
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

  await act(async () => {
    previewTick?.(16);
    await Promise.resolve();
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

test('useTimelineMediaSync schedules initial paused preview when adapter becomes ready', async () => {
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

  await act(async () => {
    previewTicks[0]?.(16);
    await Promise.resolve();
  });

  expect(seek).toHaveBeenCalledTimes(1);

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync primes a replacement adapter while paused', async () => {
  const engine = createMediaSyncEngine();
  const previewTicks: FrameRequestCallback[] = [];
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    previewTicks.push(callback);
    return previewTicks.length;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const firstSeek = vi.fn();
  const secondSeek = vi.fn();
  let adapter = {
    getClockTime: () => 1,
    startClock: () => true,
    seek: firstSeek,
  };

  const { rerender } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter,
        adapterIdentity: adapter,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    previewTicks[0]?.(16);
    await Promise.resolve();
  });
  expect(firstSeek).toHaveBeenCalledOnce();

  adapter = {
    getClockTime: () => 1,
    startClock: () => true,
    seek: secondSeek,
  };
  rerender();

  expect(rafSpy).toHaveBeenCalledTimes(2);
  await act(async () => {
    previewTicks[1]?.(32);
    await Promise.resolve();
  });
  expect(secondSeek).toHaveBeenCalledOnce();

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync does not reprime an inline seek facade on rerender', async () => {
  const engine = createMediaSyncEngine();
  const previewTicks: FrameRequestCallback[] = [];
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    previewTicks.push(callback);
    return previewTicks.length;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const seek = vi.fn();

  const { rerender } = renderHook(
    ({ revision }: { revision: number }) => {
      void revision;
      return useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock: () => true,
          seek: (...args) => seek(...args),
        },
      });
    },
    {
      initialProps: { revision: 0 },
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    previewTicks[0]?.(16);
    await Promise.resolve();
  });
  expect(seek).toHaveBeenCalledOnce();

  rerender({ revision: 1 });

  expect(rafSpy).toHaveBeenCalledOnce();
  expect(seek).toHaveBeenCalledOnce();

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync completes a queued paused seek through the latest inline facade', async () => {
  const engine = createMediaSyncEngine();
  const previewTicks: FrameRequestCallback[] = [];
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    previewTicks.push(callback);
    return previewTicks.length;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  let resolveFirstSeek = () => {};
  const firstSeekPromise = new Promise<void>((resolve) => {
    resolveFirstSeek = resolve;
  });
  const firstSeek = vi.fn(() => firstSeekPromise);
  const latestSeek = vi.fn();

  const { rerender } = renderHook(
    ({ revision }: { revision: number }) =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock: () => true,
          seek: () => (revision === 0 ? firstSeek() : latestSeek()),
        },
      }),
    {
      initialProps: { revision: 0 },
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    previewTicks[0]?.(16);
    await Promise.resolve();
  });
  expect(firstSeek).toHaveBeenCalledOnce();

  act(() => {
    engine.moveClip({ clipId: 'video-clip', startTime: fromSeconds(0.5) });
  });
  await act(async () => {
    previewTicks[1]?.(32);
    await Promise.resolve();
  });

  rerender({ revision: 1 });
  await act(async () => {
    resolveFirstSeek();
    await firstSeekPromise;
    await Promise.resolve();
  });

  expect(firstSeek).toHaveBeenCalledOnce();
  expect(latestSeek).toHaveBeenCalledOnce();

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync refreshes paused preview when a clip move changes active layers', async () => {
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

  await act(async () => {
    previewTick?.(16);
    await Promise.resolve();
  });

  expect(seek).toHaveBeenCalledTimes(1);
  expect(seek.mock.calls[0][0]).toEqual(fromSeconds(1));
  expect(seek.mock.calls[0][1].primary.visuals).toBeUndefined();
  expect(seek.mock.calls[0][1].primary.audio?.clip.id).toBe('audio-clip');

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync skips paused preview seeks until the adapter is ready', async () => {
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

  await act(async () => {
    previewTicks[0]?.(16);
    await Promise.resolve();
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

test('useTimelineMediaSync coalesces initial and media edit events into one paused preview seek', async () => {
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

  await act(async () => {
    previewTicks[0]?.(16);
    await Promise.resolve();
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
