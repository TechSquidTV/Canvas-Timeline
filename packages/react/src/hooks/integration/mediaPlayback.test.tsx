import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { expect, test, vi } from 'vite-plus/test';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { TimelineProvider } from '#react/Provider';
import * as playbackHookExports from '#react/hooks/playback';
import { useTimelineMediaPlayback } from '#react/hooks';
import { createMediaSyncEngine, mediaSyncLayers } from '#react/hooks/integration/testHelpers';

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

test('useTimelineMediaPlayback rejects commands owned by a competing clock', async () => {
  const engine = createMediaSyncEngine();
  const stopClock = vi.fn();
  const setClockRate = vi.fn();
  const syncLayers = vi.fn();
  const { result, unmount } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => 1,
        layers: mediaSyncLayers,
        stopClock,
        setClockRate,
        syncLayers,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    expect(engine.play({ clock: 'external' })).toBe(true);
  });

  await expect(result.current.play()).resolves.toEqual({
    ok: false,
    reason: 'policy-rejected',
    message: 'Timeline playback is already controlled by another clock.',
  });

  act(() => {
    expect(result.current.pause()).toEqual({
      ok: false,
      reason: 'policy-rejected',
      message: 'Timeline playback is already controlled by another clock.',
    });
  });
  await expect(result.current.setPlaybackRate(2)).resolves.toEqual({
    ok: false,
    reason: 'policy-rejected',
    message: 'Timeline playback is already controlled by another clock.',
  });
  unmount();

  expect(engine.getState().playing).toBe(true);
  expect(engine.getPlaybackRate()).toBe(1);
  expect(stopClock).not.toHaveBeenCalled();
  expect(setClockRate).not.toHaveBeenCalled();
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

test('useTimelineMediaPlayback rejects a competing clock that starts during synchronization', async () => {
  const engine = createMediaSyncEngine();
  const stopClock = vi.fn();
  const setClockRate = vi.fn();
  let resolveStartup = () => {};
  const startup = new Promise<void>((resolve) => {
    resolveStartup = resolve;
  });
  const syncLayers = vi.fn(({ reason }: { reason: string }) =>
    reason === 'play' ? startup : Promise.resolve()
  );
  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => 1,
        layers: mediaSyncLayers,
        stopClock,
        setClockRate,
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
  const pendingRateChange = result.current.setPlaybackRate(2);
  act(() => {
    expect(engine.play({ clock: 'external' })).toBe(true);
  });
  resolveStartup();

  await act(async () => {
    await expect(pendingPlay).resolves.toEqual({
      ok: false,
      reason: 'policy-rejected',
      message: 'Timeline playback is already controlled by another clock.',
    });
    await expect(pendingRateChange).resolves.toEqual({
      ok: false,
      reason: 'policy-rejected',
      message: 'Timeline playback is already controlled by another clock.',
    });
  });
  expect(engine.getState().playing).toBe(true);
  expect(engine.getPlaybackRate()).toBe(1);
  expect(stopClock).not.toHaveBeenCalled();
  expect(setClockRate).not.toHaveBeenCalled();
  expect(syncLayers).not.toHaveBeenCalledWith(expect.objectContaining({ reason: 'rate' }));
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
