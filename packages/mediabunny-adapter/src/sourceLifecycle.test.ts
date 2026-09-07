import { expect, test, vi } from 'vite-plus/test';
import type { ActiveClip } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import type * as RealMediabunny from 'mediabunny';
import { createMediabunnyAdapter, type MediabunnyModule } from '#mediabunny-adapter/index';
import {
  mediabunnyTestFixtures,
  type MockVideoTrack,
  type MockAudioTrack,
  type MockCanvasSink,
  type MockWrappedCanvas,
} from '#mediabunny-adapter-test/testHelpers';

const {
  waitForAdapterLoad,
  createMockVideoTrack,
  createMockAudioTrack,
  createMockInput,
  createMockAudioContext,
  urlSource,
  createMockMediabunny,
  createActiveClip,
  createActiveLayers,
} = mediabunnyTestFixtures;

test('createMediabunnyAdapter lazily loads, preloads, and unloads registered sources', async () => {
  const firstInput = createMockInput({ metadataDuration: 4 });
  const secondInput = createMockInput({ metadataDuration: 5 });
  const mockMediabunny = createMockMediabunny([firstInput, secondInput]);
  const loadMediabunny = vi.fn(async () => mockMediabunny.module);
  const adapter = createMediabunnyAdapter({
    mediabunny: loadMediabunny,
    sources: [
      { sourceId: 'source-1', input: 'https://media.example/one.mp4' },
      { sourceId: 'source-2', input: 'https://media.example/two.mp4' },
    ],
  });

  expect(loadMediabunny).not.toHaveBeenCalled();
  expect([...adapter.sourceStateById.values()].map((state) => state.status)).toEqual([
    'idle',
    'idle',
  ]);

  await expect(adapter.preloadSource('source-1')).resolves.toMatchObject({
    ok: true,
    state: 'ready',
  });
  expect(loadMediabunny).toHaveBeenCalledTimes(1);
  expect(adapter.sourceStateById.get('source-1')?.status).toBe('ready');
  expect(adapter.sourceStateById.get('source-2')?.status).toBe('idle');
  const sourceSnapshot = adapter.sourceStateById;
  adapter.setSources([
    { sourceId: 'source-1', input: 'https://media.example/one.mp4' },
    { sourceId: 'source-2', input: 'https://media.example/two.mp4' },
  ]);
  expect(adapter.sourceStateById).toBe(sourceSnapshot);
  expect(adapter.startClock(fromSeconds(0), 1)).toBe(false);

  const secondClip = createActiveClip('visual', 'source-2', 0);
  await adapter.seek(fromSeconds(0), createActiveLayers([secondClip], 0));
  expect(adapter.startClock(fromSeconds(0), 1)).toBe(true);

  expect(adapter.unloadSource('source-1')).toBe(true);
  expect(firstInput.dispose).toHaveBeenCalled();
  expect(adapter.sourceStateById.get('source-1')?.status).toBe('idle');
  expect(adapter.unloadSource('source-2')).toBe(true);
  expect(adapter.startClock(fromSeconds(0), 1)).toBe(false);
  expect(adapter.unloadSource('missing')).toBe(false);
});

test('createMediabunnyAdapter publishes the unloaded status with the idle source snapshot', async () => {
  const mockMediabunny = createMockMediabunny([createMockInput()]);
  const snapshots: Array<{ status: string; sourceStatus: string | null }> = [];
  let captureSnapshot = () => {};
  const adapter = createMediabunnyAdapter({
    mediabunny: mockMediabunny.module,
    sources: [{ sourceId: 'source-1', input: 'https://media.example/one.mp4' }],
    onChange: () => captureSnapshot(),
  });
  captureSnapshot = () => {
    snapshots.push({
      status: adapter.status,
      sourceStatus: adapter.sourceStateById.get('source-1')?.status ?? null,
    });
  };
  await adapter.preloadSource('source-1');
  snapshots.length = 0;

  expect(adapter.unloadSource('source-1')).toBe(true);

  expect(snapshots).toEqual([
    {
      status: 'Source unloaded. It will reload when active or explicitly preloaded.',
      sourceStatus: 'idle',
    },
  ]);
});

test('createMediabunnyAdapter invalidates a pending preload when its source is unloaded', async () => {
  const pendingInput = createMockInput();
  let resolvePendingTrack = (_track: MockVideoTrack | null) => {};
  pendingInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((resolve) => {
        resolvePendingTrack = resolve;
      })
  );
  const adapter = createMediabunnyAdapter({
    mediabunny: createMockMediabunny([pendingInput]).module,
    sources: [urlSource('source-1', 'https://media.example/original.mp4')],
  });

  const preload = adapter.preloadSource('source-1');
  await vi.waitFor(() => {
    expect(pendingInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });
  expect(adapter.unloadSource('source-1')).toBe(true);
  resolvePendingTrack(createMockVideoTrack());

  await expect(preload).resolves.toMatchObject({
    ok: false,
    error: expect.objectContaining({ name: 'SupersededSourceLoadError' }),
  });
  expect(pendingInput.dispose).toHaveBeenCalledOnce();
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({ status: 'idle', error: null });
});

test('createMediabunnyAdapter keeps unload ahead of a pending seek load', async () => {
  const pendingInput = createMockInput();
  const unexpectedReloadInput = createMockInput();
  let resolvePendingTrack = (_track: MockVideoTrack | null) => {};
  pendingInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((resolve) => {
        resolvePendingTrack = resolve;
      })
  );
  const mockMediabunny = createMockMediabunny([pendingInput, unexpectedReloadInput]);
  const adapter = createMediabunnyAdapter({
    mediabunny: mockMediabunny.module,
    sources: [urlSource('source-1', 'https://media.example/original.mp4')],
  });
  const visualClip = createActiveClip('visual', 'source-1', 1);

  const seek = adapter.seek(fromSeconds(1), createActiveLayers([visualClip], 1));
  await vi.waitFor(() => {
    expect(pendingInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });
  expect(adapter.unloadSource('source-1')).toBe(true);
  resolvePendingTrack(createMockVideoTrack());
  await seek;

  expect(mockMediabunny.constructInput).toHaveBeenCalledOnce();
  expect(unexpectedReloadInput.getPrimaryVideoTrack).not.toHaveBeenCalled();
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({ status: 'idle', error: null });
});

test('createMediabunnyAdapter invalidates a pending replacement when its source is unloaded', async () => {
  const initialInput = createMockInput({ metadataDuration: 6 });
  const pendingReplacementInput = createMockInput({ metadataDuration: 9 });
  let resolveReplacementTrack = (_track: MockVideoTrack | null) => {};
  pendingReplacementInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((resolve) => {
        resolveReplacementTrack = resolve;
      })
  );
  const adapter = createMediabunnyAdapter({
    mediabunny: createMockMediabunny([initialInput, pendingReplacementInput]).module,
    sources: [urlSource('source-1', 'https://media.example/original.mp4')],
  });

  await waitForAdapterLoad(adapter);
  const replacement = adapter.replaceSource(
    urlSource('source-1', 'https://media.example/replacement.mp4')
  );
  await vi.waitFor(() => {
    expect(pendingReplacementInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });
  expect(adapter.unloadSource('source-1')).toBe(true);
  resolveReplacementTrack(createMockVideoTrack());

  await expect(replacement).resolves.toMatchObject({
    ok: false,
    error: expect.objectContaining({ name: 'SupersededSourceLoadError' }),
  });
  expect(initialInput.dispose).toHaveBeenCalledOnce();
  expect(pendingReplacementInput.dispose).toHaveBeenCalledOnce();
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({ status: 'idle', error: null });
});

test('createMediabunnyAdapter invalidates active recovery when its source is unloaded', async () => {
  const initialInput = createMockInput({ metadataDuration: 6 });
  const pendingFallbackInput = createMockInput({ metadataDuration: 9 });
  let resolveFallbackTrack = (_track: MockVideoTrack | null) => {};
  pendingFallbackInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((resolve) => {
        resolveFallbackTrack = resolve;
      })
  );
  const decoderError = new Error('decoder failed before unload');
  const adapter = createMediabunnyAdapter({
    canvas: document.createElement('canvas'),
    mediabunny: createMockMediabunny([initialInput, pendingFallbackInput], {
      canvasSink: {
        getCanvas: vi.fn(async () => Promise.reject(decoderError)),
        canvases: vi.fn(async function* () {}),
      },
    }).module,
    sources: [
      {
        sourceId: 'source-1',
        input: { kind: 'url', url: 'https://media.example/original.mp4' },
        fallbacks: [{ kind: 'url', url: 'https://media.example/fallback.mp4' }],
      },
    ],
  });
  const visualClip = createActiveClip('visual', 'source-1', 1);

  await waitForAdapterLoad(adapter);
  await expect(adapter.renderVideo(visualClip, fromSeconds(1))).rejects.toBe(decoderError);
  await vi.waitFor(() => {
    expect(pendingFallbackInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });
  expect(adapter.unloadSource('source-1')).toBe(true);
  resolveFallbackTrack(createMockVideoTrack());
  await vi.waitFor(() => {
    expect(pendingFallbackInput.dispose).toHaveBeenCalledOnce();
  });

  expect(initialInput.dispose).toHaveBeenCalledOnce();
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({ status: 'idle', error: null });
  expect(adapter.error).toBeNull();
});

test('createMediabunnyAdapter atomically publishes readiness after replacing an empty registry', async () => {
  const mockMediabunny = createMockMediabunny([createMockInput()]);
  const snapshots: Array<{ ready: boolean; sourceStatus: string | null }> = [];
  let captureSnapshot = () => {};
  const adapter = createMediabunnyAdapter({
    mediabunny: mockMediabunny.module,
    sources: [],
    onChange: () => captureSnapshot(),
  });
  captureSnapshot = () => {
    snapshots.push({
      ready: adapter.ready,
      sourceStatus: adapter.sourceStateById.get('source-1')?.status ?? null,
    });
  };

  await expect(
    adapter.replaceSource({
      sourceId: 'source-1',
      input: 'https://media.example/replacement.mp4',
    })
  ).resolves.toMatchObject({ ok: true, state: 'ready' });

  expect(snapshots.at(-1)).toEqual({ ready: true, sourceStatus: 'ready' });
});

test('createMediabunnyAdapter waits for an idle source replacement before seeking', async () => {
  const replacementTrack = createMockVideoTrack();
  const replacementInput = createMockInput({
    videoTrack: replacementTrack,
    metadataDuration: 9,
  });
  const originalInput = createMockInput({ metadataDuration: 6 });
  let resolveReplacementTrack = (_track: MockVideoTrack | null) => {};
  replacementInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((resolve) => {
        resolveReplacementTrack = resolve;
      })
  );
  const mockMediabunny = createMockMediabunny([replacementInput, originalInput]);
  const adapter = createMediabunnyAdapter({
    mediabunny: mockMediabunny.module,
    sources: [urlSource('source-1', 'https://media.example/original.mp4')],
  });
  const visualClip = createActiveClip('visual', 'source-1', 1);

  const replacement = adapter.replaceSource(
    urlSource('source-1', 'https://media.example/replacement.mp4')
  );
  await vi.waitFor(() => {
    expect(replacementInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });
  let seekSettled = false;
  const seek = adapter.seek(fromSeconds(1), createActiveLayers([visualClip], 1)).then(() => {
    seekSettled = true;
  });
  await Promise.resolve();

  expect(seekSettled).toBe(false);
  expect(originalInput.getPrimaryVideoTrack).not.toHaveBeenCalled();

  resolveReplacementTrack(replacementTrack);
  await expect(replacement).resolves.toMatchObject({ ok: true, state: 'ready' });
  await seek;

  expect(originalInput.getPrimaryVideoTrack).not.toHaveBeenCalled();
  expect(mockMediabunny.constructInput).toHaveBeenCalledOnce();
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'ready',
    metadata: { durationSeconds: 9 },
  });
});

test('createMediabunnyAdapter resumes an idle source load after replacement fails', async () => {
  const failedReplacementInput = createMockInput({ videoTrack: null, audioTrack: null });
  const originalInput = createMockInput({ metadataDuration: 6 });
  let resolveReplacementTrack = (_track: MockVideoTrack | null) => {};
  failedReplacementInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((resolve) => {
        resolveReplacementTrack = resolve;
      })
  );
  const mockMediabunny = createMockMediabunny([failedReplacementInput, originalInput]);
  const adapter = createMediabunnyAdapter({
    mediabunny: mockMediabunny.module,
    sources: [urlSource('source-1', 'https://media.example/original.mp4')],
  });
  const visualClip = createActiveClip('visual', 'source-1', 1);

  const replacement = adapter.replaceSource(
    urlSource('source-1', 'https://media.example/broken.mp4')
  );
  await vi.waitFor(() => {
    expect(failedReplacementInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });
  const seek = adapter.seek(fromSeconds(1), createActiveLayers([visualClip], 1));
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  expect(originalInput.getPrimaryVideoTrack).not.toHaveBeenCalled();

  resolveReplacementTrack(null);
  await expect(replacement).resolves.toMatchObject({
    ok: false,
    reason: 'load-failed',
    error: expect.objectContaining({
      message: 'No audio or video track found for source "source-1".',
    }),
  });
  await seek;

  expect(originalInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  expect(mockMediabunny.constructInput).toHaveBeenCalledTimes(2);
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'ready',
    metadata: { durationSeconds: 6 },
  });
});

test('createMediabunnyAdapter lets preload await a pending new-source replacement', async () => {
  const replacementTrack = createMockVideoTrack();
  const replacementInput = createMockInput({
    videoTrack: replacementTrack,
    metadataDuration: 9,
  });
  let resolveReplacementTrack = (_track: MockVideoTrack | null) => {};
  replacementInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((resolve) => {
        resolveReplacementTrack = resolve;
      })
  );
  const adapter = createMediabunnyAdapter({
    mediabunny: createMockMediabunny([replacementInput]).module,
    sources: [],
  });

  const replacement = adapter.replaceSource(
    urlSource('new-source', 'https://media.example/replacement.mp4')
  );
  await vi.waitFor(() => {
    expect(replacementInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });
  let preloadSettled = false;
  const preload = adapter.preloadSource('new-source').then((result) => {
    preloadSettled = true;
    return result;
  });
  await Promise.resolve();
  expect(preloadSettled).toBe(false);

  resolveReplacementTrack(replacementTrack);
  await expect(replacement).resolves.toMatchObject({ ok: true, state: 'ready' });
  await expect(preload).resolves.toMatchObject({ ok: true, state: 'ready' });
  expect(adapter.sourceStateById.get('new-source')).toMatchObject({ status: 'ready' });
});

test('createMediabunnyAdapter shares a failed new-source replacement with pending preload', async () => {
  const failedReplacementInput = createMockInput({ videoTrack: null, audioTrack: null });
  let resolveReplacementTrack = (_track: MockVideoTrack | null) => {};
  failedReplacementInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((resolve) => {
        resolveReplacementTrack = resolve;
      })
  );
  const adapter = createMediabunnyAdapter({
    mediabunny: createMockMediabunny([failedReplacementInput]).module,
    sources: [],
  });

  const replacement = adapter.replaceSource(
    urlSource('new-source', 'https://media.example/broken.mp4')
  );
  await vi.waitFor(() => {
    expect(failedReplacementInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });
  let preloadSettled = false;
  const preload = adapter.preloadSource('new-source').then((result) => {
    preloadSettled = true;
    return result;
  });
  await Promise.resolve();
  expect(preloadSettled).toBe(false);

  resolveReplacementTrack(null);
  const replacementResult = await replacement;
  const preloadResult = await preload;

  expect(replacementResult).toMatchObject({ ok: false, reason: 'load-failed' });
  expect(preloadResult).toBe(replacementResult);
  expect(adapter.ready).toBe(false);
  expect(adapter.sourceStateById.has('new-source')).toBe(false);
});

test('createMediabunnyAdapter loads a replacement while the previous source load is pending', async () => {
  const previousInput = createMockInput();
  const replacementInput = createMockInput({ metadataDuration: 9 });
  let resolvePreviousTrack = (_track: MockVideoTrack | null) => {};
  previousInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((resolve) => {
        resolvePreviousTrack = resolve;
      })
  );
  const mockMediabunny = createMockMediabunny([previousInput, replacementInput]);
  const adapter = createMediabunnyAdapter({
    mediabunny: mockMediabunny.module,
    sources: [urlSource('source-1', 'https://media.example/original.mp4')],
  });

  const previousLoad = adapter.preloadSource('source-1');
  await vi.waitFor(() => {
    expect(previousInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });

  adapter.setSources([urlSource('source-1', 'https://media.example/replacement.mp4')]);
  await expect(adapter.preloadSource('source-1')).resolves.toMatchObject({
    ok: true,
    state: 'ready',
  });
  expect(adapter.sourceStateById.get('source-1')?.metadata?.durationSeconds).toBe(9);

  resolvePreviousTrack(createMockVideoTrack());
  await expect(previousLoad).resolves.toMatchObject({
    ok: false,
    reason: 'load-failed',
    error: expect.objectContaining({ message: 'Loading source "source-1" was superseded.' }),
  });
  expect(adapter.sourceStateById.get('source-1')?.metadata?.durationSeconds).toBe(9);
});

test('createMediabunnyAdapter lets reconciliation invalidate an active seek load', async () => {
  const previousInput = createMockInput();
  const replacementInput = createMockInput({ metadataDuration: 9 });
  let resolvePreviousTrack = (_track: MockVideoTrack | null) => {};
  previousInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((resolve) => {
        resolvePreviousTrack = resolve;
      })
  );
  const adapter = createMediabunnyAdapter({
    mediabunny: createMockMediabunny([previousInput, replacementInput]).module,
    sources: [urlSource('source-1', 'https://media.example/original.mp4')],
  });
  const visualClip = createActiveClip('visual', 'source-1', 1);

  const pendingSeek = adapter.seek(fromSeconds(1), createActiveLayers([visualClip], 1));
  await vi.waitFor(() => {
    expect(previousInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });

  adapter.setSources([urlSource('source-1', 'https://media.example/replacement.mp4')]);
  resolvePreviousTrack(createMockVideoTrack());

  await expect(pendingSeek).resolves.toBeUndefined();
  expect(replacementInput.getPrimaryVideoTrack).not.toHaveBeenCalled();
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'idle',
    metadata: null,
  });
});

test('createMediabunnyAdapter ignores a superseded source failure after replacement', async () => {
  const previousInput = createMockInput();
  const replacementInput = createMockInput({ metadataDuration: 9 });
  let rejectPreviousTrack = (_error: Error) => {};
  previousInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((_resolve, reject) => {
        rejectPreviousTrack = reject;
      })
  );
  const adapter = createMediabunnyAdapter({
    mediabunny: createMockMediabunny([previousInput, replacementInput]).module,
    sources: [urlSource('source-1', 'https://media.example/original.mp4')],
  });

  const previousLoad = adapter.preloadSource('source-1');
  await vi.waitFor(() => {
    expect(previousInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });

  adapter.setSources([urlSource('source-1', 'https://media.example/replacement.mp4')]);
  await expect(adapter.preloadSource('source-1')).resolves.toMatchObject({
    ok: true,
    state: 'ready',
  });

  rejectPreviousTrack(new Error('stale source failed'));
  await expect(previousLoad).resolves.toMatchObject({
    ok: false,
    reason: 'load-failed',
  });
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'ready',
    metadata: { durationSeconds: 9 },
    error: null,
  });
  expect(adapter.error).toBeNull();
});

test('createMediabunnyAdapter ignores a superseded runtime recovery failure', async () => {
  const initialInput = createMockInput();
  const fallbackInput = createMockInput();
  const replacementInput = createMockInput({ metadataDuration: 9 });
  let rejectFallbackTrack = (_error: Error) => {};
  fallbackInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((_resolve, reject) => {
        rejectFallbackTrack = reject;
      })
  );
  const canvasSink: MockCanvasSink = {
    getCanvas: vi.fn(async (timestamp) => ({
      canvas: document.createElement('canvas'),
      timestamp,
      duration: 1 / 30,
    })),
    canvases: vi.fn(async function* () {
      yield await Promise.reject(new Error('decoder failed'));
    }),
  };
  const adapter = createMediabunnyAdapter({
    canvas: document.createElement('canvas'),
    mediabunny: createMockMediabunny([initialInput, fallbackInput, replacementInput], {
      canvasSink,
    }).module,
    sources: [
      {
        sourceId: 'source-1',
        input: { kind: 'url', url: 'https://media.example/original.mp4' },
        fallbacks: [{ kind: 'url', url: 'https://media.example/fallback.mp4' }],
      },
    ],
  });
  const visualClip = createActiveClip('visual', 'source-1', 1);

  await waitForAdapterLoad(adapter);
  await adapter.seek(fromSeconds(1), createActiveLayers([visualClip], 1));
  expect(adapter.startClock(fromSeconds(1), 1)).toBe(true);
  await adapter.syncLayers({
    timelineTime: fromSeconds(1),
    reason: 'play',
    activeLayers: createActiveLayers([visualClip], 1),
  });
  await vi.waitFor(() => {
    expect(fallbackInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });

  adapter.setSources([urlSource('source-1', 'https://media.example/replacement.mp4')]);
  await expect(adapter.preloadSource('source-1')).resolves.toMatchObject({
    ok: true,
    state: 'ready',
  });

  rejectFallbackTrack(new Error('stale recovery failed'));
  await vi.waitFor(() => {
    expect(fallbackInput.dispose).toHaveBeenCalledOnce();
  });
  expect(adapter.error).toBeNull();
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'ready',
    metadata: { durationSeconds: 9 },
    error: null,
  });
});

test('createMediabunnyAdapter keeps a pending replacement ahead of outgoing recovery', async () => {
  const initialInput = createMockInput({ metadataDuration: 6 });
  const replacementTrack = createMockVideoTrack();
  const replacementInput = createMockInput({
    videoTrack: replacementTrack,
    metadataDuration: 9,
  });
  const fallbackInput = createMockInput({ metadataDuration: 12 });
  let resolveReplacementTrack = (_track: MockVideoTrack | null) => {};
  replacementInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((resolve) => {
        resolveReplacementTrack = resolve;
      })
  );
  const decoderError = new Error('outgoing decoder failed');
  const canvasSink: MockCanvasSink = {
    getCanvas: vi.fn(async () => Promise.reject(decoderError)),
    canvases: vi.fn(async function* () {}),
  };
  const adapter = createMediabunnyAdapter({
    canvas: document.createElement('canvas'),
    mediabunny: createMockMediabunny([initialInput, replacementInput, fallbackInput], {
      canvasSink,
    }).module,
    sources: [
      {
        sourceId: 'source-1',
        input: { kind: 'url', url: 'https://media.example/original.mp4' },
        fallbacks: [{ kind: 'url', url: 'https://media.example/fallback.mp4' }],
      },
    ],
  });
  const visualClip = createActiveClip('visual', 'source-1', 1);

  await waitForAdapterLoad(adapter);
  const replacement = adapter.replaceSource(
    urlSource('source-1', 'https://media.example/replacement.mp4')
  );
  await vi.waitFor(() => {
    expect(replacementInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });

  await expect(adapter.renderVideo(visualClip, fromSeconds(1))).rejects.toBe(decoderError);
  expect(fallbackInput.getPrimaryVideoTrack).not.toHaveBeenCalled();

  resolveReplacementTrack(replacementTrack);
  await expect(replacement).resolves.toMatchObject({ ok: true, state: 'ready' });
  expect(fallbackInput.getPrimaryVideoTrack).not.toHaveBeenCalled();
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'ready',
    metadata: { durationSeconds: 9 },
    error: null,
  });
});

test('createMediabunnyAdapter resumes outgoing recovery after a replacement fails', async () => {
  const initialInput = createMockInput({ metadataDuration: 6 });
  const failedReplacementInput = createMockInput({ videoTrack: null, audioTrack: null });
  const fallbackTrack = createMockVideoTrack();
  const fallbackInput = createMockInput({ metadataDuration: 12 });
  let resolveReplacementTrack = (_track: MockVideoTrack | null) => {};
  let resolveFallbackTrack = (_track: MockVideoTrack | null) => {};
  failedReplacementInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((resolve) => {
        resolveReplacementTrack = resolve;
      })
  );
  fallbackInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((resolve) => {
        resolveFallbackTrack = resolve;
      })
  );
  const decoderError = new Error('outgoing decoder failed');
  const canvasSink: MockCanvasSink = {
    getCanvas: vi.fn(async () => Promise.reject(decoderError)),
    canvases: vi.fn(async function* () {}),
  };
  const adapter = createMediabunnyAdapter({
    canvas: document.createElement('canvas'),
    mediabunny: createMockMediabunny([initialInput, failedReplacementInput, fallbackInput], {
      canvasSink,
    }).module,
    sources: [
      {
        sourceId: 'source-1',
        input: { kind: 'url', url: 'https://media.example/original.mp4' },
        fallbacks: [{ kind: 'url', url: 'https://media.example/fallback.mp4' }],
      },
    ],
  });
  const visualClip = createActiveClip('visual', 'source-1', 1);
  const audioClip = createActiveClip('audio', 'source-1', 1);

  await waitForAdapterLoad(adapter);
  const replacement = adapter.replaceSource(
    urlSource('source-1', 'https://media.example/replacement.mp4')
  );
  await vi.waitFor(() => {
    expect(failedReplacementInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });

  await expect(adapter.renderVideo(visualClip, fromSeconds(1))).rejects.toBe(decoderError);
  expect(fallbackInput.getPrimaryVideoTrack).not.toHaveBeenCalled();
  let seekSettled = false;
  const seek = adapter.seek(fromSeconds(2), createActiveLayers([audioClip], 2)).then(() => {
    seekSettled = true;
  });
  await Promise.resolve();
  expect(seekSettled).toBe(false);

  resolveReplacementTrack(null);
  await expect(replacement).resolves.toMatchObject({ ok: false, reason: 'load-failed' });
  await vi.waitFor(() => {
    expect(fallbackInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });
  expect(seekSettled).toBe(false);
  resolveFallbackTrack(fallbackTrack);
  await seek;
  await vi.waitFor(() => {
    expect(adapter.sourceStateById.get('source-1')).toMatchObject({
      status: 'ready',
      selectedInputIndex: 1,
      metadata: { durationSeconds: 12 },
      error: null,
    });
  });
});

test('createMediabunnyAdapter keeps a later replacement ahead of an active recovery', async () => {
  const initialInput = createMockInput({ metadataDuration: 6 });
  const staleFallbackInput = createMockInput({ metadataDuration: 12 });
  const replacementInput = createMockInput({ metadataDuration: 9 });
  let resolveStaleFallback = (_track: MockVideoTrack | null) => {};
  staleFallbackInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((resolve) => {
        resolveStaleFallback = resolve;
      })
  );
  const decoderError = new Error('outgoing decoder failed');
  const canvasSink: MockCanvasSink = {
    getCanvas: vi.fn(async () => Promise.reject(decoderError)),
    canvases: vi.fn(async function* () {}),
  };
  const adapter = createMediabunnyAdapter({
    canvas: document.createElement('canvas'),
    mediabunny: createMockMediabunny([initialInput, staleFallbackInput, replacementInput], {
      canvasSink,
    }).module,
    sources: [
      {
        sourceId: 'source-1',
        input: { kind: 'url', url: 'https://media.example/original.mp4' },
        fallbacks: [{ kind: 'url', url: 'https://media.example/fallback.mp4' }],
      },
    ],
  });
  const visualClip = createActiveClip('visual', 'source-1', 1);

  await waitForAdapterLoad(adapter);
  await expect(adapter.renderVideo(visualClip, fromSeconds(1))).rejects.toBe(decoderError);
  await vi.waitFor(() => {
    expect(staleFallbackInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });

  await expect(
    adapter.replaceSource(urlSource('source-1', 'https://media.example/replacement.mp4'))
  ).resolves.toMatchObject({ ok: true, state: 'ready' });
  resolveStaleFallback(createMockVideoTrack());
  await vi.waitFor(() => {
    expect(staleFallbackInput.dispose).toHaveBeenCalledOnce();
  });

  expect(adapter.error).toBeNull();
  expect(adapter.status).toBe('Ready. Mediabunny can drive timeline video and audio.');
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'ready',
    metadata: { durationSeconds: 9 },
    error: null,
  });
});

test('createMediabunnyAdapter resumes active recovery after a later replacement fails', async () => {
  const initialInput = createMockInput({ metadataDuration: 6 });
  const staleFallbackInput = createMockInput({ metadataDuration: 8 });
  const failedReplacementInput = createMockInput({ videoTrack: null, audioTrack: null });
  const resumedFallbackInput = createMockInput({ metadataDuration: 12 });
  let resolveStaleFallback = (_track: MockVideoTrack | null) => {};
  staleFallbackInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((resolve) => {
        resolveStaleFallback = resolve;
      })
  );
  const decoderError = new Error('outgoing decoder failed');
  const canvasSink: MockCanvasSink = {
    getCanvas: vi.fn(async () => Promise.reject(decoderError)),
    canvases: vi.fn(async function* () {}),
  };
  const adapter = createMediabunnyAdapter({
    canvas: document.createElement('canvas'),
    mediabunny: createMockMediabunny(
      [initialInput, staleFallbackInput, failedReplacementInput, resumedFallbackInput],
      { canvasSink }
    ).module,
    sources: [
      {
        sourceId: 'source-1',
        input: { kind: 'url', url: 'https://media.example/original.mp4' },
        fallbacks: [{ kind: 'url', url: 'https://media.example/fallback.mp4' }],
      },
    ],
  });
  const visualClip = createActiveClip('visual', 'source-1', 1);

  await waitForAdapterLoad(adapter);
  await expect(adapter.renderVideo(visualClip, fromSeconds(1))).rejects.toBe(decoderError);
  await vi.waitFor(() => {
    expect(staleFallbackInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });

  await expect(
    adapter.replaceSource(urlSource('source-1', 'https://media.example/broken.mp4'))
  ).resolves.toMatchObject({ ok: false, reason: 'load-failed' });
  await vi.waitFor(() => {
    expect(resumedFallbackInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
    expect(adapter.sourceStateById.get('source-1')).toMatchObject({
      status: 'ready',
      selectedInputIndex: 1,
      metadata: { durationSeconds: 12 },
      error: null,
    });
  });

  resolveStaleFallback(createMockVideoTrack());
  await vi.waitFor(() => {
    expect(staleFallbackInput.dispose).toHaveBeenCalledOnce();
  });
  expect(adapter.error).toBeNull();
  expect(adapter.sourceStateById.get('source-1')?.metadata?.durationSeconds).toBe(12);
});

test('createMediabunnyAdapter lets a successful retry supersede active recovery', async () => {
  const initialInput = createMockInput({ metadataDuration: 6 });
  const staleFallbackInput = createMockInput({ metadataDuration: 8 });
  const retryInput = createMockInput({ metadataDuration: 12 });
  let resolveStaleFallback = (_track: MockVideoTrack | null) => {};
  staleFallbackInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((resolve) => {
        resolveStaleFallback = resolve;
      })
  );
  const decoderError = new Error('decoder failed before retry');
  const adapter = createMediabunnyAdapter({
    canvas: document.createElement('canvas'),
    mediabunny: createMockMediabunny([initialInput, staleFallbackInput, retryInput], {
      canvasSink: {
        getCanvas: vi.fn(async () => Promise.reject(decoderError)),
        canvases: vi.fn(async function* () {}),
      },
    }).module,
    sources: [
      {
        sourceId: 'source-1',
        input: { kind: 'url', url: 'https://media.example/original.mp4' },
        fallbacks: [{ kind: 'url', url: 'https://media.example/fallback.mp4' }],
      },
    ],
  });
  const visualClip = createActiveClip('visual', 'source-1', 1);

  await waitForAdapterLoad(adapter);
  await expect(adapter.renderVideo(visualClip, fromSeconds(1))).rejects.toBe(decoderError);
  await vi.waitFor(() => {
    expect(staleFallbackInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });

  await expect(adapter.retrySource('source-1')).resolves.toMatchObject({
    ok: true,
    state: 'ready',
  });
  resolveStaleFallback(createMockVideoTrack());
  await vi.waitFor(() => {
    expect(staleFallbackInput.dispose).toHaveBeenCalledOnce();
  });

  expect(adapter.error).toBeNull();
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'ready',
    selectedInputIndex: 0,
    metadata: { durationSeconds: 12 },
    error: null,
  });
});

test('createMediabunnyAdapter publishes failed when retry supersedes active recovery', async () => {
  const initialInput = createMockInput({ metadataDuration: 6 });
  const staleFallbackInput = createMockInput({ metadataDuration: 8 });
  const failedRetryInput = createMockInput({ videoTrack: null, audioTrack: null });
  const failedRetryFallbackInput = createMockInput({ videoTrack: null, audioTrack: null });
  let resolveStaleFallback = (_track: MockVideoTrack | null) => {};
  staleFallbackInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((resolve) => {
        resolveStaleFallback = resolve;
      })
  );
  const decoderError = new Error('decoder failed before retry');
  const adapter = createMediabunnyAdapter({
    canvas: document.createElement('canvas'),
    mediabunny: createMockMediabunny(
      [initialInput, staleFallbackInput, failedRetryInput, failedRetryFallbackInput],
      {
        canvasSink: {
          getCanvas: vi.fn(async () => Promise.reject(decoderError)),
          canvases: vi.fn(async function* () {}),
        },
      }
    ).module,
    sources: [
      {
        sourceId: 'source-1',
        input: { kind: 'url', url: 'https://media.example/original.mp4' },
        fallbacks: [{ kind: 'url', url: 'https://media.example/fallback.mp4' }],
      },
    ],
  });
  const visualClip = createActiveClip('visual', 'source-1', 1);

  await waitForAdapterLoad(adapter);
  await expect(adapter.renderVideo(visualClip, fromSeconds(1))).rejects.toBe(decoderError);
  await vi.waitFor(() => {
    expect(staleFallbackInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });

  await expect(adapter.retrySource('source-1')).resolves.toMatchObject({
    ok: false,
    reason: 'load-failed',
  });
  resolveStaleFallback(createMockVideoTrack());
  await vi.waitFor(() => {
    expect(staleFallbackInput.dispose).toHaveBeenCalledOnce();
  });

  expect(initialInput.dispose).toHaveBeenCalledOnce();
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'failed',
    selectedInputIndex: null,
    error: expect.any(Error),
  });
  await expect(adapter.getFrame(visualClip)).resolves.toBeNull();
});

test('createMediabunnyAdapter does not restore stale state from a superseded retry', async () => {
  const failedInput = createMockInput({ videoTrack: null, audioTrack: null });
  const retryInput = createMockInput();
  const replacementInput = createMockInput({ metadataDuration: 9 });
  let rejectRetryTrack = (_error: Error) => {};
  retryInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((_resolve, reject) => {
        rejectRetryTrack = reject;
      })
  );
  const adapter = createMediabunnyAdapter({
    mediabunny: createMockMediabunny([failedInput, retryInput, replacementInput]).module,
    sources: [urlSource('source-1', 'https://media.example/original.mp4')],
  });

  await expect(adapter.preloadSource('source-1')).resolves.toMatchObject({ ok: false });
  const retry = adapter.retrySource('source-1');
  await vi.waitFor(() => {
    expect(retryInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });
  await expect(
    adapter.replaceSource(urlSource('source-1', 'https://media.example/replacement.mp4'))
  ).resolves.toMatchObject({ ok: true, state: 'ready' });

  rejectRetryTrack(new Error('stale retry failed'));
  await expect(retry).resolves.toMatchObject({ ok: false });
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'ready',
    metadata: { durationSeconds: 9 },
    error: null,
  });
});

test('createMediabunnyAdapter restores committed state when retry supersedes replacement', async () => {
  const initialInput = createMockInput({ metadataDuration: 6 });
  const replacementInput = createMockInput({ metadataDuration: 9 });
  const failedRetryInput = createMockInput({ videoTrack: null, audioTrack: null });
  let resolveReplacementTrack = (_track: MockVideoTrack | null) => {};
  replacementInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((resolve) => {
        resolveReplacementTrack = resolve;
      })
  );
  const adapter = createMediabunnyAdapter({
    mediabunny: createMockMediabunny([initialInput, replacementInput, failedRetryInput]).module,
    sources: [urlSource('source-1', 'https://media.example/original.mp4')],
  });

  await waitForAdapterLoad(adapter);
  const committedStatus = adapter.status;
  const replacement = adapter.replaceSource(
    urlSource('source-1', 'https://media.example/replacement.mp4')
  );
  await vi.waitFor(() => {
    expect(replacementInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });

  await expect(adapter.retrySource('source-1')).resolves.toMatchObject({
    ok: false,
    reason: 'load-failed',
  });
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'ready',
    metadata: { durationSeconds: 6 },
    error: null,
  });
  expect(adapter.status).toBe(committedStatus);
  expect(adapter.error).toBeNull();

  resolveReplacementTrack(createMockVideoTrack());
  await expect(replacement).resolves.toMatchObject({
    ok: false,
    error: expect.objectContaining({ name: 'SupersededSourceLoadError' }),
  });
});

test('createMediabunnyAdapter does not restore stale state from a superseded replacement', async () => {
  const initialInput = createMockInput({ metadataDuration: 6 });
  const staleReplacementInput = createMockInput();
  const currentReplacementInput = createMockInput({ metadataDuration: 9 });
  let rejectStaleTrack = (_error: Error) => {};
  staleReplacementInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((_resolve, reject) => {
        rejectStaleTrack = reject;
      })
  );
  const adapter = createMediabunnyAdapter({
    mediabunny: createMockMediabunny([initialInput, staleReplacementInput, currentReplacementInput])
      .module,
    sources: [urlSource('source-1', 'https://media.example/original.mp4')],
  });

  await waitForAdapterLoad(adapter);
  const staleReplacement = adapter.replaceSource(
    urlSource('source-1', 'https://media.example/stale.mp4')
  );
  await vi.waitFor(() => {
    expect(staleReplacementInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });
  await expect(
    adapter.replaceSource(urlSource('source-1', 'https://media.example/current.mp4'))
  ).resolves.toMatchObject({ ok: true, state: 'ready' });

  rejectStaleTrack(new Error('stale replacement failed'));
  await expect(staleReplacement).resolves.toMatchObject({ ok: false });
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'ready',
    metadata: { durationSeconds: 9 },
    error: null,
  });
});

test('createMediabunnyAdapter lets a complete registry supersede a pending replacement', async () => {
  const originalInput = createMockInput({ metadataDuration: 4 });
  const replacementAudioTrack = createMockAudioTrack();
  const replacementInput = createMockInput({ videoTrack: null, audioTrack: replacementAudioTrack });
  let resolveReplacementTrack = (_track: MockAudioTrack | null) => {};
  replacementInput.getPrimaryAudioTrack = vi.fn(
    () =>
      new Promise<MockAudioTrack | null>((resolve) => {
        resolveReplacementTrack = resolve;
      })
  );
  const staleAudioContext = createMockAudioContext();
  const constructAudioContext = vi.fn();
  class StaleAudioContextConstructor {
    constructor() {
      constructAudioContext();
      return staleAudioContext;
    }
  }
  window.AudioContext = StaleAudioContextConstructor as unknown as typeof AudioContext;
  const originalSource = urlSource('source-1', 'https://media.example/original.mp4');
  const adapter = createMediabunnyAdapter({
    mediabunny: createMockMediabunny([originalInput, replacementInput]).module,
    sources: [originalSource],
  });

  await expect(adapter.preloadSource('source-1')).resolves.toMatchObject({
    ok: true,
    state: 'ready',
  });

  const replacement = adapter.replaceSource(
    urlSource('source-1', 'https://media.example/replacement.mp4')
  );
  await vi.waitFor(() => {
    expect(replacementInput.getPrimaryAudioTrack).toHaveBeenCalledOnce();
  });

  adapter.setSources([originalSource]);
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'ready',
    metadata: { durationSeconds: 4 },
  });
  resolveReplacementTrack(replacementAudioTrack);

  await expect(replacement).resolves.toMatchObject({
    ok: false,
    error: expect.objectContaining({ name: 'SupersededSourceLoadError' }),
  });
  expect(replacementInput.dispose).toHaveBeenCalledOnce();
  expect(originalInput.dispose).not.toHaveBeenCalled();
  expect(constructAudioContext).not.toHaveBeenCalled();
  expect(staleAudioContext.createGain).not.toHaveBeenCalled();
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'ready',
    metadata: { durationSeconds: 4 },
  });
});

test('createMediabunnyAdapter does not resurrect after replacement notification disposal', async () => {
  const originalInput = createMockInput({ metadataDuration: 4 });
  const replacementInput = createMockInput({
    videoTrack: null,
    audioTrack: createMockAudioTrack(),
    metadataDuration: 9,
  });
  let disposeOnAudioReady = false;
  const adapterRef: { current: ReturnType<typeof createMediabunnyAdapter> | null } = {
    current: null,
  };
  const adapter = createMediabunnyAdapter({
    mediabunny: createMockMediabunny([originalInput, replacementInput]).module,
    sources: [urlSource('source-1', 'https://media.example/original.mp4')],
    onChange: () => {
      const currentAdapter = adapterRef.current;
      if (disposeOnAudioReady && currentAdapter?.audioStatus.state === 'running') {
        currentAdapter.dispose();
      }
    },
  });
  adapterRef.current = adapter;

  await waitForAdapterLoad(adapter);
  disposeOnAudioReady = true;

  await expect(
    adapter.replaceSource(urlSource('source-1', 'https://media.example/replacement.webm'))
  ).resolves.toMatchObject({ ok: true, state: 'ready' });
  expect(adapter.ready).toBe(false);
  expect(adapter.status).toBe('Mediabunny adapter disposed.');
  expect(adapter.sourceStateById.size).toBe(0);
  expect(originalInput.dispose).toHaveBeenCalledOnce();
  expect(replacementInput.dispose).toHaveBeenCalledOnce();
});

test('createMediabunnyAdapter rolls back failed replacements for idle and new sources', async () => {
  const failedExistingInput = createMockInput({ videoTrack: null, audioTrack: null });
  const originalInput = createMockInput({ metadataDuration: 4 });
  const existingSource = urlSource('source-1', 'https://media.example/original.mp4');
  const adapter = createMediabunnyAdapter({
    mediabunny: createMockMediabunny([failedExistingInput, originalInput]).module,
    sources: [existingSource],
  });

  await expect(
    adapter.replaceSource(urlSource('source-1', 'https://media.example/broken.mp4'))
  ).resolves.toMatchObject({ ok: false, reason: 'load-failed' });
  expect(adapter.error).toBeNull();
  expect(adapter.status).toBe('Sources registered. Mediabunny loads active media on demand.');
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({ status: 'idle', error: null });
  await expect(adapter.preloadSource('source-1')).resolves.toMatchObject({
    ok: true,
    state: 'ready',
  });
  expect(adapter.sourceStateById.get('source-1')?.metadata?.durationSeconds).toBe(4);

  const emptyAdapter = createMediabunnyAdapter({
    mediabunny: createMockMediabunny([createMockInput({ videoTrack: null, audioTrack: null })])
      .module,
    sources: [],
  });
  await expect(
    emptyAdapter.replaceSource(urlSource('new-source', 'https://media.example/broken-new.mp4'))
  ).resolves.toMatchObject({ ok: false, reason: 'load-failed' });
  expect(emptyAdapter.ready).toBe(false);
  expect(emptyAdapter.error).toBeNull();
  expect(emptyAdapter.status).toBe('No Mediabunny sources are configured.');
  expect(emptyAdapter.sourceStateById.has('new-source')).toBe(false);
  await expect(emptyAdapter.retrySource('new-source')).resolves.toMatchObject({
    ok: false,
    reason: 'unknown-source',
  });
});

test('createMediabunnyAdapter loads concise browser inputs and advanced descriptors', async () => {
  const blob = new Blob(['sample']);
  const file = new File(['sample'], 'sample.mp4', { type: 'video/mp4' });
  const url = new URL('https://media.example/url-object.mp4');
  const request = new Request('https://media.example/request.mp4');
  const urlInput = createMockInput({ metadataDuration: 4 });
  const blobInput = createMockInput({ metadataDuration: 5 });
  const urlObjectInput = createMockInput({ metadataDuration: 5.5 });
  const requestInput = createMockInput({ metadataDuration: 5.75 });
  const fileInput = createMockInput({ metadataDuration: 5.9 });
  const providedInput = createMockInput({ metadataDuration: 6 });
  const createdInput = createMockInput({ metadataDuration: null, computedDuration: 7 });
  const mockMediabunny = createMockMediabunny([
    urlInput,
    blobInput,
    urlObjectInput,
    requestInput,
    fileInput,
  ]);
  const adapter = createMediabunnyAdapter({
    audio: { context: createMockAudioContext() as unknown as AudioContext },
    mediabunny: mockMediabunny.module,
    sources: [
      urlSource('url-source', 'https://media.example/video.mp4'),
      { sourceId: 'blob-source', input: blob },
      { sourceId: 'url-object-source', input: url },
      { sourceId: 'request-source', input: request },
      { sourceId: 'file-source', input: file },
      {
        sourceId: 'input-source',
        input: {
          kind: 'input',
          input: providedInput as unknown as RealMediabunny.Input,
        },
      },
      {
        sourceId: 'created-source',
        input: {
          kind: 'input-factory',
          createInput: (mediabunny) => {
            expect(mediabunny).toBe(mockMediabunny.module);
            return createdInput as unknown as RealMediabunny.Input;
          },
        },
      },
    ],
  });

  await waitForAdapterLoad(adapter);

  expect(adapter.ready).toBe(true);
  expect(adapter.status).toBe('Ready. Mediabunny can drive timeline video and audio.');
  expect(adapter.sourceStateById.get('url-source')?.metadata?.durationSeconds).toBe(4);
  expect(adapter.sourceStateById.get('blob-source')?.metadata?.durationSeconds).toBe(5);
  expect(adapter.sourceStateById.get('url-object-source')?.metadata?.durationSeconds).toBe(5.5);
  expect(adapter.sourceStateById.get('request-source')?.metadata?.durationSeconds).toBe(5.75);
  expect(adapter.sourceStateById.get('file-source')?.metadata?.durationSeconds).toBe(5.9);
  expect(adapter.sourceStateById.get('input-source')?.metadata?.durationSeconds).toBe(6);
  expect(adapter.sourceStateById.get('created-source')?.metadata?.durationSeconds).toBe(7);
  expect(mockMediabunny.createdUrlSources).toEqual([
    'https://media.example/video.mp4',
    url,
    request,
  ]);
  expect(mockMediabunny.createdBlobSources).toEqual([blob, file]);

  adapter.dispose();
  expect(urlInput.dispose).toHaveBeenCalled();
  expect(blobInput.dispose).toHaveBeenCalled();
  expect(urlObjectInput.dispose).toHaveBeenCalled();
  expect(requestInput.dispose).toHaveBeenCalled();
  expect(fileInput.dispose).toHaveBeenCalled();
  expect(providedInput.dispose).not.toHaveBeenCalled();
  expect(createdInput.dispose).toHaveBeenCalled();
});

test('createMediabunnyAdapter selects input fallbacks and surfaces load failures', async () => {
  const firstInput = createMockInput({ metadataDuration: 4 });
  const duplicateInput = createMockInput({ metadataDuration: 9 });
  const mockMediabunny = createMockMediabunny([firstInput, duplicateInput]);
  const adapter = createMediabunnyAdapter({
    audio: { context: createMockAudioContext() as unknown as AudioContext },
    mediabunny: mockMediabunny.module,
    sources: [
      {
        sourceId: 'same-source',
        input: { kind: 'url', url: 'https://media.example/first.mp4' },
        fallbacks: [{ kind: 'url', url: 'https://media.example/second.mp4' }],
      },
    ],
  });

  await waitForAdapterLoad(adapter);

  expect(adapter.sourceStateById.get('same-source')?.metadata?.durationSeconds).toBe(4);
  expect(adapter.sourceStateById.get('same-source')?.selectedInputIndex).toBe(0);
  expect(mockMediabunny.createdUrlSources).toEqual(['https://media.example/first.mp4']);
  expect(duplicateInput.getPrimaryVideoTrack).not.toHaveBeenCalled();

  const failedInput = createMockInput({ videoTrack: null, audioTrack: null });
  const failingAdapter = createMediabunnyAdapter({
    audio: { context: createMockAudioContext() as unknown as AudioContext },
    mediabunny: createMockMediabunny([failedInput]).module,
    sources: [urlSource('empty-source', 'https://media.example/empty.mp4')],
  });

  await waitForAdapterLoad(failingAdapter);

  expect(failingAdapter.ready).toBe(true);
  expect(failingAdapter.error?.message).toBe(
    'No audio or video track found for source "empty-source".'
  );
  expect(failingAdapter.status).toBe(failingAdapter.error?.message);
  expect(failedInput.dispose).toHaveBeenCalled();

  const emptyAdapter = createMediabunnyAdapter({
    mediabunny: createMockMediabunny([]).module,
    sources: [],
  });

  await waitForAdapterLoad(emptyAdapter);
  expect(emptyAdapter.ready).toBe(false);
  expect(emptyAdapter.status).toBe('No Mediabunny sources are configured.');
});

test('createMediabunnyAdapter reports module loader failures and retries the loader', async () => {
  const input = createMockInput();
  const mockMediabunny = createMockMediabunny([input]);
  const loadMediabunny = vi
    .fn<() => Promise<MediabunnyModule>>()
    .mockRejectedValueOnce(new Error('module download failed'))
    .mockResolvedValueOnce(mockMediabunny.module);
  const adapter = createMediabunnyAdapter({
    mediabunny: loadMediabunny,
    sources: [urlSource('source-1', 'https://media.example/video.mp4')],
  });

  await expect(adapter.preloadSource('source-1')).resolves.toMatchObject({
    ok: false,
    reason: 'load-failed',
    error: expect.objectContaining({ message: 'module download failed' }),
  });
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'failed',
    error: expect.objectContaining({ message: 'module download failed' }),
  });

  await expect(adapter.retrySource('source-1')).resolves.toMatchObject({
    ok: true,
    state: 'ready',
  });
  expect(loadMediabunny).toHaveBeenCalledTimes(2);
});

test('createMediabunnyAdapter reports synchronous module loader failures as source results', async () => {
  const loadMediabunny = vi.fn<() => Promise<MediabunnyModule>>(() => {
    throw new Error('module loader threw synchronously');
  });
  const adapter = createMediabunnyAdapter({
    mediabunny: loadMediabunny,
    sources: [urlSource('source-1', 'https://media.example/video.mp4')],
  });

  await expect(adapter.preloadSource('source-1')).resolves.toMatchObject({
    ok: false,
    reason: 'load-failed',
    error: expect.objectContaining({ message: 'module loader threw synchronously' }),
  });
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'failed',
    error: expect.objectContaining({ message: 'module loader threw synchronously' }),
  });
});

test('createMediabunnyAdapter replaces an app-resolved proxy and maps its timestamps', async () => {
  const originalInput = createMockInput({ metadataDuration: 20 });
  const proxyInput = createMockInput({ firstTimestamp: 0, metadataDuration: 10 });
  const mockMediabunny = createMockMediabunny([originalInput, proxyInput]);
  const adapter = createMediabunnyAdapter({
    mediabunny: mockMediabunny.module,
    sources: [
      {
        sourceId: 'source-1',
        input: 'https://media.example/original.mp4',
      },
    ],
  });

  await waitForAdapterLoad(adapter);
  const originalSnapshot = adapter.sourceStateById;
  await expect(adapter.retrySource('missing-source')).resolves.toMatchObject({
    ok: false,
    reason: 'unknown-source',
  });
  await expect(
    adapter.replaceSource({
      sourceId: 'source-1',
      input: 'https://media.example/proxy.mp4',
      timing: { sourceTimeSeconds: 10, mediaTimeSeconds: 0 },
    })
  ).resolves.toMatchObject({
    ok: true,
    state: 'ready',
  });
  expect(adapter.sourceStateById).not.toBe(originalSnapshot);

  const frame = await adapter.getFrame(createActiveClip('visual', 'source-1', 1));
  expect(mockMediabunny.canvasSink.getCanvas).toHaveBeenCalledWith(1);
  expect(frame?.timestamp).toBe(11);
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    selectedInputIndex: 0,
    metadata: {
      sourceFirstTimestampSeconds: 10,
      sourceEndTimestampSeconds: 20,
    },
  });
});

test('createMediabunnyAdapter ignores async load completion after disposal', async () => {
  let resolveInput: (input: RealMediabunny.Input) => void = () => {};
  const inputPromise = new Promise<RealMediabunny.Input>((resolve) => {
    resolveInput = resolve;
  });
  const mockMediabunny = createMockMediabunny([]);
  const adapter = createMediabunnyAdapter({
    audio: { context: createMockAudioContext() as unknown as AudioContext },
    mediabunny: mockMediabunny.module,
    sources: [
      {
        sourceId: 'slow-source',
        input: { kind: 'input-factory', createInput: () => inputPromise },
      },
    ],
  });

  const preloadPromise = adapter.preloadSource('slow-source');
  adapter.dispose();
  resolveInput(createMockInput() as unknown as RealMediabunny.Input);
  await preloadPromise;
  await new Promise((resolve) => window.setTimeout(resolve, 0));

  expect(adapter.ready).toBe(false);
  expect(adapter.status).toBe('Mediabunny adapter disposed.');
  expect(adapter.sourceStateById.size).toBe(0);
  expect(mockMediabunny.constructCanvasSink).not.toHaveBeenCalled();
  expect(mockMediabunny.constructAudioSink).not.toHaveBeenCalled();
});

test('createMediabunnyAdapter creates no source resources when its module resolves after disposal', async () => {
  const mockMediabunny = createMockMediabunny([createMockInput()]);
  let resolveModule = (_module: MediabunnyModule) => {};
  const modulePromise = new Promise<MediabunnyModule>((resolve) => {
    resolveModule = resolve;
  });
  const loadMediabunny = vi.fn(() => modulePromise);
  const adapter = createMediabunnyAdapter({
    mediabunny: loadMediabunny,
    sources: [urlSource('source-1', 'https://media.example/video.mp4')],
  });

  const preload = adapter.preloadSource('source-1');
  await vi.waitFor(() => {
    expect(loadMediabunny).toHaveBeenCalledOnce();
  });
  adapter.dispose();
  resolveModule(mockMediabunny.module);

  await expect(preload).resolves.toMatchObject({
    ok: false,
    error: expect.objectContaining({ name: 'SupersededSourceLoadError' }),
  });
  expect(mockMediabunny.createdUrlSources).toHaveLength(0);
  expect(mockMediabunny.constructInput).not.toHaveBeenCalled();
  expect(mockMediabunny.constructCanvasSink).not.toHaveBeenCalled();
  expect(mockMediabunny.constructAudioSink).not.toHaveBeenCalled();
  expect(adapter.status).toBe('Mediabunny adapter disposed.');
  expect(adapter.sourceStateById.size).toBe(0);
});

test('createMediabunnyAdapter does not create Web Audio resources after disposal', async () => {
  const audioTrack = createMockAudioTrack();
  const input = createMockInput({ videoTrack: null, audioTrack });
  let resolveAudioTrack = (_track: MockAudioTrack | null) => {};
  input.getPrimaryAudioTrack = vi.fn(
    () =>
      new Promise<MockAudioTrack | null>((resolve) => {
        resolveAudioTrack = resolve;
      })
  );
  const lateAudioContext = createMockAudioContext();
  const constructAudioContext = vi.fn();
  class LateAudioContextConstructor {
    constructor() {
      constructAudioContext();
      return lateAudioContext;
    }
  }
  window.AudioContext = LateAudioContextConstructor as unknown as typeof AudioContext;
  const adapter = createMediabunnyAdapter({
    mediabunny: createMockMediabunny([input]).module,
    sources: [urlSource('audio-source', 'https://media.example/audio.webm')],
  });

  const preload = adapter.preloadSource('audio-source');
  await vi.waitFor(() => {
    expect(input.getPrimaryAudioTrack).toHaveBeenCalledOnce();
  });
  adapter.dispose();
  adapter.dispose();
  resolveAudioTrack(audioTrack);
  await preload;

  expect(constructAudioContext).not.toHaveBeenCalled();
  expect(lateAudioContext.createGain).not.toHaveBeenCalled();
  expect(lateAudioContext.close).not.toHaveBeenCalled();
  expect(input.dispose).toHaveBeenCalledOnce();
  expect(adapter.status).toBe('Mediabunny adapter disposed.');
});

test('createMediabunnyAdapter keeps disposal terminal across active recovery and seek work', async () => {
  const initialInput = createMockInput();
  const fallbackInput = createMockInput();
  let resolveFallbackTrack = (_track: MockVideoTrack | null) => {};
  fallbackInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((resolve) => {
        resolveFallbackTrack = resolve;
      })
  );
  const decoderError = new Error('decoder failed before disposal');
  const canvasSink: MockCanvasSink = {
    getCanvas: vi.fn(async () => Promise.reject(decoderError)),
    canvases: vi.fn(async function* () {}),
  };
  const adapter = createMediabunnyAdapter({
    canvas: document.createElement('canvas'),
    mediabunny: createMockMediabunny([initialInput, fallbackInput], { canvasSink }).module,
    sources: [
      {
        sourceId: 'source-1',
        input: { kind: 'url', url: 'https://media.example/original.mp4' },
        fallbacks: [{ kind: 'url', url: 'https://media.example/fallback.mp4' }],
      },
    ],
  });
  const visualClip = createActiveClip('visual', 'source-1', 1);

  await waitForAdapterLoad(adapter);
  await expect(adapter.renderVideo(visualClip, fromSeconds(1))).rejects.toBe(decoderError);
  await vi.waitFor(() => {
    expect(fallbackInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });
  const pendingSeek = adapter.seek(fromSeconds(1), createActiveLayers([visualClip], 1));

  adapter.dispose();
  resolveFallbackTrack(createMockVideoTrack());
  await pendingSeek;
  await vi.waitFor(() => {
    expect(fallbackInput.dispose).toHaveBeenCalledOnce();
  });

  expect(adapter.ready).toBe(false);
  expect(adapter.status).toBe('Mediabunny adapter disposed.');
  expect(adapter.error).toBeNull();
  expect(adapter.sourceStateById.size).toBe(0);
});

test('createMediabunnyAdapter does not paint or notify after disposal during frame decode', async () => {
  const input = createMockInput();
  const sourceCanvas = document.createElement('canvas');
  const drawImage = vi.fn();
  const previewCanvas = document.createElement('canvas');
  previewCanvas.getContext = vi.fn(() => ({
    clearRect: vi.fn(),
    drawImage,
  })) as unknown as typeof previewCanvas.getContext;
  let resolveFrame = (_frame: MockWrappedCanvas | null) => {};
  const getCanvas = vi.fn(
    () =>
      new Promise<MockWrappedCanvas | null>((resolve) => {
        resolveFrame = resolve;
      })
  );
  const onChange = vi.fn();
  const adapter = createMediabunnyAdapter({
    canvas: previewCanvas,
    mediabunny: createMockMediabunny([input], {
      canvasSink: { getCanvas, canvases: vi.fn(async function* () {}) },
    }).module,
    sources: [urlSource('source-1', 'https://media.example/video.mp4')],
    onChange,
  });
  const frameListener = vi.fn();

  await waitForAdapterLoad(adapter);
  const unsubscribe = adapter.subscribeFrame(frameListener);
  onChange.mockClear();
  const render = adapter.renderVideo(createActiveClip('visual', 'source-1', 1), fromSeconds(1));
  await vi.waitFor(() => {
    expect(getCanvas).toHaveBeenCalledOnce();
  });

  adapter.dispose();
  resolveFrame({ canvas: sourceCanvas, timestamp: 1, duration: 1 / 30 });
  await expect(render).resolves.toBeUndefined();
  unsubscribe();

  expect(drawImage).not.toHaveBeenCalled();
  expect(frameListener).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
  expect(adapter.lastFrameTime).toBeNull();
  expect(adapter.status).toBe('Mediabunny adapter disposed.');
});

test('createMediabunnyAdapter rejects new work after disposal and keeps teardown idempotent', async () => {
  const adapter = createMediabunnyAdapter({
    mediabunny: createMockMediabunny([]).module,
    sources: [urlSource('source-1', 'https://media.example/video.mp4')],
  });
  const activeLayers = createActiveLayers([], 0);
  const disposedError = 'Mediabunny adapter has been disposed.';

  adapter.dispose();

  expect(() => adapter.subscribeFrame(() => {})).toThrow(disposedError);
  expect(() => adapter.setCanvas(document.createElement('canvas'))).toThrow(disposedError);
  expect(() => adapter.startClock(fromSeconds(0), 1)).toThrow(disposedError);
  expect(() => adapter.requestClockActivation(1)).toThrow(disposedError);
  expect(() => adapter.setVolume(0.5)).toThrow(disposedError);
  expect(() => adapter.setMuted(true)).toThrow(disposedError);
  expect(() => adapter.setSources([])).toThrow(disposedError);
  expect(() => adapter.unloadSource('source-1')).toThrow(disposedError);
  expect(() => adapter.setClockRate(2)).toThrow(disposedError);
  expect(() => adapter.syncAudio(undefined, fromSeconds(0), 'pause')).toThrow(disposedError);
  await expect(adapter.preloadSource('source-1')).rejects.toThrow(disposedError);
  await expect(adapter.retrySource('source-1')).rejects.toThrow(disposedError);
  await expect(
    adapter.replaceSource(urlSource('source-1', 'https://media.example/replacement.mp4'))
  ).rejects.toThrow(disposedError);
  await expect(adapter.seek(fromSeconds(0), activeLayers)).rejects.toThrow(disposedError);
  await expect(adapter.renderVideo({} as ActiveClip, fromSeconds(0))).rejects.toThrow(
    disposedError
  );
  await expect(
    adapter.syncLayers({ timelineTime: fromSeconds(0), reason: 'pause', activeLayers })
  ).rejects.toThrow(disposedError);
  await expect(adapter.getFrame({} as ActiveClip)).rejects.toThrow(disposedError);

  expect(adapter.getClockTime()).toBe(0);
  expect(() => adapter.stopClock()).not.toThrow();
  expect(() => adapter.clearVideo()).not.toThrow();
  expect(() => adapter.onStatus('paused')).not.toThrow();
  expect(() => adapter.dispose()).not.toThrow();
  expect(adapter.status).toBe('Mediabunny adapter disposed.');
  expect(adapter.sourceStateById.size).toBe(0);
});
