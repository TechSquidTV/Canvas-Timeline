import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import type { ActiveClip, ActiveLayerResult, Clip, Track } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import * as RealMediabunny from 'mediabunny';
import {
  createMediabunnyAdapter,
  formatMediabunnyTime,
  type MediabunnyModule,
  type MediabunnySource,
} from '#mediabunny-adapter/index';

const originalAudioContext = window.AudioContext;
const originalWebkitAudioContext = (
  window as typeof window & { webkitAudioContext?: typeof AudioContext }
).webkitAudioContext;

class MockAudioContextConstructor {
  constructor() {
    return createMockAudioContext();
  }
}

beforeEach(() => {
  window.AudioContext = MockAudioContextConstructor as unknown as typeof AudioContext;
});

afterEach(() => {
  vi.restoreAllMocks();
  window.AudioContext = originalAudioContext;
  (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext =
    originalWebkitAudioContext;
});

type MockVideoTrack = {
  getCodec: ReturnType<typeof vi.fn<() => Promise<string | null>>>;
  canDecode: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  canBeTransparent: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  getDisplayWidth: ReturnType<typeof vi.fn<() => Promise<number>>>;
  getDisplayHeight: ReturnType<typeof vi.fn<() => Promise<number>>>;
  getRotation: ReturnType<typeof vi.fn<() => Promise<0>>>;
  computePacketStats: ReturnType<typeof vi.fn<() => Promise<{ averagePacketRate: number }>>>;
};

type MockAudioTrack = {
  getCodec: ReturnType<typeof vi.fn<() => Promise<string | null>>>;
  canDecode: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  getSampleRate: ReturnType<typeof vi.fn<() => Promise<number>>>;
};

type MockInput = {
  getPrimaryVideoTrack: ReturnType<typeof vi.fn<() => Promise<MockVideoTrack | null>>>;
  getPrimaryAudioTrack: ReturnType<typeof vi.fn<() => Promise<MockAudioTrack | null>>>;
  getVideoTracks: ReturnType<typeof vi.fn<() => Promise<MockVideoTrack[]>>>;
  getAudioTracks: ReturnType<typeof vi.fn<() => Promise<MockAudioTrack[]>>>;
  getFirstTimestamp: ReturnType<typeof vi.fn<() => Promise<number>>>;
  getDurationFromMetadata: ReturnType<typeof vi.fn<() => Promise<number | null>>>;
  computeDuration: ReturnType<typeof vi.fn<() => Promise<number>>>;
  dispose: ReturnType<typeof vi.fn<() => void>>;
};

type MockCanvasSink = {
  getCanvas: ReturnType<
    typeof vi.fn<
      (
        timestamp: number
      ) => Promise<{ canvas: HTMLCanvasElement; timestamp: number; duration: number } | null>
    >
  >;
  canvases: ReturnType<
    typeof vi.fn<
      (
        start?: number,
        end?: number
      ) => AsyncGenerator<
        {
          canvas: HTMLCanvasElement;
          timestamp: number;
          duration: number;
        },
        void
      >
    >
  >;
};

type MockAudioSink = {
  buffers: ReturnType<
    typeof vi.fn<(start: number, end: number) => AsyncGenerator<MockWrappedAudioBuffer, void>>
  >;
};

interface MockWrappedAudioBuffer {
  buffer: AudioBuffer;
  timestamp: number;
  duration: number;
}

interface MockAudioContext {
  currentTime: number;
  destination: AudioNode;
  sampleRate: number;
  state: AudioContextState;
  createGain: ReturnType<typeof vi.fn<() => GainNode>>;
  createBufferSource: ReturnType<typeof vi.fn<() => AudioBufferSourceNode>>;
  close: ReturnType<typeof vi.fn<() => Promise<void>>>;
  resume: ReturnType<typeof vi.fn<() => Promise<void>>>;
}

async function waitForAdapterLoad(adapter: ReturnType<typeof createMediabunnyAdapter>) {
  await Promise.all([...adapter.sourceStateById.keys()].map(adapter.preloadSource));
}

function createMockVideoTrack(): MockVideoTrack {
  return {
    getCodec: vi.fn(async () => 'vp09'),
    canDecode: vi.fn(async () => true),
    canBeTransparent: vi.fn(async () => false),
    getDisplayWidth: vi.fn(async () => 1920),
    getDisplayHeight: vi.fn(async () => 1080),
    getRotation: vi.fn(async () => 0 as const),
    computePacketStats: vi.fn(async () => ({ averagePacketRate: 30 })),
  };
}

function createMockAudioTrack(): MockAudioTrack {
  return {
    getCodec: vi.fn(async () => 'opus'),
    canDecode: vi.fn(async () => true),
    getSampleRate: vi.fn(async () => 48_000),
  };
}

function createMockInput(
  options: {
    videoTrack?: MockVideoTrack | null;
    audioTrack?: MockAudioTrack | null;
    firstTimestamp?: number;
    metadataDuration?: number | null;
    computedDuration?: number;
  } = {}
): MockInput {
  const videoTrack = Object.hasOwn(options, 'videoTrack')
    ? options.videoTrack
    : createMockVideoTrack();
  const audioTrack = Object.hasOwn(options, 'audioTrack') ? options.audioTrack : null;
  const metadataDuration = Object.hasOwn(options, 'metadataDuration')
    ? options.metadataDuration
    : 6;

  return {
    getPrimaryVideoTrack: vi.fn(async () => videoTrack ?? null),
    getPrimaryAudioTrack: vi.fn(async () => audioTrack ?? null),
    getVideoTracks: vi.fn(async () =>
      videoTrack === null || videoTrack === undefined ? [] : [videoTrack]
    ),
    getAudioTracks: vi.fn(async () =>
      audioTrack === null || audioTrack === undefined ? [] : [audioTrack]
    ),
    getFirstTimestamp: vi.fn(async () => options.firstTimestamp ?? 0),
    getDurationFromMetadata: vi.fn(async () => metadataDuration ?? null),
    computeDuration: vi.fn(async () => options.computedDuration ?? 6),
    dispose: vi.fn(),
  };
}

function createMockAudioContext(): MockAudioContext {
  const gainNode = {
    gain: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as GainNode;
  const context: MockAudioContext = {
    currentTime: 10,
    destination: {} as AudioNode,
    sampleRate: 48_000,
    state: 'running',
    createGain: vi.fn(() => gainNode),
    createBufferSource: vi.fn(() => {
      const node = {
        buffer: null,
        playbackRate: { value: 1 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      };
      return node as unknown as AudioBufferSourceNode;
    }),
    close: vi.fn(async () => {}),
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
  };
  return context;
}

function urlSource(sourceId: string, url: string): MediabunnySource {
  return { sourceId, input: { kind: 'url', url } };
}

function createActiveLayerResult(activeClips: ActiveClip[], time = 1): ActiveLayerResult<string> {
  return {
    time: fromSeconds(time),
    all: activeClips,
    byTrack: new Map(activeClips.map((clip) => [clip.track.id, [clip]])),
    layers: {},
    primary: {},
    hasActiveClips: activeClips.length > 0,
    firstContentTime: activeClips[0]?.clip.timelineStart,
  };
}

function createMockMediabunny(
  inputs: readonly MockInput[],
  sinkOptions: {
    canvasSink?: MockCanvasSink;
    audioSink?: MockAudioSink;
  } = {}
) {
  const createdUrlSources: (string | URL | Request)[] = [];
  const createdBlobSources: Blob[] = [];
  const { audioSink, canvasSink } = createSinkFactory(sinkOptions);
  let inputIndex = 0;

  class MockInputConstructor {
    constructor() {
      const input = inputs[inputIndex];
      inputIndex += 1;
      return input;
    }
  }

  class MockUrlSource {
    constructor(url: string | URL | Request) {
      createdUrlSources.push(url);
    }
  }

  class MockBlobSource {
    constructor(blob: Blob) {
      createdBlobSources.push(blob);
    }
  }

  class MockCanvasSinkConstructor {
    constructor() {
      return canvasSink;
    }
  }

  class MockAudioBufferSinkConstructor {
    constructor() {
      return audioSink;
    }
  }

  return {
    audioSink,
    canvasSink,
    createdBlobSources,
    createdUrlSources,
    module: {
      ...RealMediabunny,
      Input: MockInputConstructor,
      UrlSource: MockUrlSource,
      BlobSource: MockBlobSource,
      CanvasSink: MockCanvasSinkConstructor,
      AudioBufferSink: MockAudioBufferSinkConstructor,
    } as unknown as MediabunnyModule,
  };
}

function createSinkFactory(
  options: {
    canvasSink?: MockCanvasSink;
    audioSink?: MockAudioSink;
  } = {}
) {
  const canvasSink =
    options.canvasSink ??
    ({
      getCanvas: vi.fn(async (timestamp: number) => ({
        canvas: document.createElement('canvas'),
        timestamp,
        duration: 1 / 30,
      })),
      canvases: vi.fn(async function* () {}),
    } satisfies MockCanvasSink);
  const audioSink =
    options.audioSink ??
    ({
      buffers: vi.fn(async function* (start: number, end: number) {
        yield {
          buffer: {} as AudioBuffer,
          timestamp: start,
          duration: end - start,
        };
      }),
    } satisfies MockAudioSink);

  return {
    audioSink,
    canvasSink,
  };
}

function createTrack(kind: string, clips: Clip[]): Track {
  return {
    id: `${kind}-track`,
    kind,
    selected: false,
    locked: false,
    muted: false,
    visible: true,
    clips,
  };
}

function createClip(
  id: string,
  sourceId: string,
  timelineStart: number,
  sourceStart: number
): Clip {
  return {
    id,
    sourceId,
    timelineStart: fromSeconds(timelineStart),
    timelineEnd: fromSeconds(timelineStart + 5),
    sourceStart: fromSeconds(sourceStart),
    selected: false,
  };
}

function createActiveClip(
  trackKind: string,
  sourceId: string,
  timelineSeconds: number
): ActiveClip {
  const clip = createClip(`${trackKind}-clip`, sourceId, 0, trackKind === 'audio' ? 20 : 10);
  const track = createTrack(trackKind, [clip]);
  const sourceTime = fromSeconds((trackKind === 'audio' ? 20 : 10) + timelineSeconds);

  return {
    track,
    clip,
    timelineTime: fromSeconds(timelineSeconds),
    sourceTime,
    sourceRange: {
      sourceId,
      start: fromSeconds(trackKind === 'audio' ? 20 : 10),
      end: fromSeconds((trackKind === 'audio' ? 20 : 10) + 5),
      duration: fromSeconds(5),
    },
    syncKey: `${trackKind}:${sourceId}:${clip.id}`,
  };
}

function createActiveLayers(activeClips: ActiveClip[], time = 1): ActiveLayerResult<string> {
  return createActiveLayerResult(activeClips, time);
}

test('formatMediabunnyTime formats finite and invalid values', () => {
  expect(formatMediabunnyTime(1.234)).toBe('1.23s');
  expect(formatMediabunnyTime(Number.NaN)).toBe('0.00s');
});

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

test('createMediabunnyAdapter retries an active seek after its source load is superseded', async () => {
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
  expect(replacementInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'ready',
    metadata: { durationSeconds: 9 },
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
  const fallbackInput = createMockInput({ metadataDuration: 12 });
  let resolveReplacementTrack = (_track: MockVideoTrack | null) => {};
  failedReplacementInput.getPrimaryVideoTrack = vi.fn(
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

  await waitForAdapterLoad(adapter);
  const replacement = adapter.replaceSource(
    urlSource('source-1', 'https://media.example/replacement.mp4')
  );
  await vi.waitFor(() => {
    expect(failedReplacementInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });

  await expect(adapter.renderVideo(visualClip, fromSeconds(1))).rejects.toBe(decoderError);
  expect(fallbackInput.getPrimaryVideoTrack).not.toHaveBeenCalled();

  resolveReplacementTrack(null);
  await expect(replacement).resolves.toMatchObject({ ok: false, reason: 'load-failed' });
  await vi.waitFor(() => {
    expect(fallbackInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });
  await vi.waitFor(() => {
    expect(adapter.sourceStateById.get('source-1')).toMatchObject({
      status: 'ready',
      selectedInputIndex: 1,
      metadata: { durationSeconds: 12 },
      error: null,
    });
  });
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
  const adapter = createMediabunnyAdapter({
    audio: { context: createMockAudioContext() as unknown as AudioContext },
    mediabunny: createMockMediabunny([]).module,
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

test('createMediabunnyAdapter maps active layers to video frames and audio ranges', async () => {
  const audioTrack = createMockAudioTrack();
  const input = createMockInput({ audioTrack });
  const audioContext = createMockAudioContext();
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = 16;
  sourceCanvas.height = 9;
  const targetCanvas = document.createElement('canvas');
  const drawImage = vi.fn();
  const clearRect = vi.fn();
  vi.spyOn(targetCanvas, 'getContext').mockReturnValue({
    clearRect,
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  const canvasSink: MockCanvasSink = {
    getCanvas: vi.fn(async (timestamp) => ({
      canvas: sourceCanvas,
      timestamp,
      duration: 1 / 30,
    })),
    canvases: vi.fn(async function* () {}),
  };
  const audioSink: MockAudioSink = {
    buffers: vi.fn(async function* (start: number, end: number) {
      yield {
        buffer: {} as AudioBuffer,
        timestamp: start,
        duration: end - start,
      };
    }),
  };
  const mockMediabunny = createMockMediabunny([input], { audioSink, canvasSink });
  const adapter = createMediabunnyAdapter({
    audio: { context: audioContext as unknown as AudioContext },
    canvas: targetCanvas,
    mediabunny: mockMediabunny.module,
    sources: [urlSource('source-1', 'https://media.example/video.mp4')],
  });
  const visualClip = createActiveClip('visual', 'source-1', 1.5);
  const audioClip = createActiveClip('audio', 'source-1', 1.5);

  await waitForAdapterLoad(adapter);
  await adapter.seek(fromSeconds(1.5), createActiveLayers([visualClip, audioClip], 1.5));

  expect(canvasSink.getCanvas).toHaveBeenCalledWith(11.5);
  expect(targetCanvas.width).toBe(16);
  expect(targetCanvas.height).toBe(9);
  expect(drawImage).toHaveBeenCalledWith(sourceCanvas, 0, 0);
  expect(adapter.lastFrameTime).toBe(11.5);
  expect(adapter.status).toBe('Ready. Visuals and audio are mapped from separate timeline clips.');

  adapter.startClock(fromSeconds(1.5), 1);
  await adapter.syncLayers({
    timelineTime: fromSeconds(1.5),
    reason: 'play',
    activeLayers: createActiveLayers([visualClip, audioClip], 1.5),
  });
  expect(audioSink.buffers).toHaveBeenCalledWith(21.5, 25);

  await adapter.syncLayers({
    timelineTime: fromSeconds(1.5),
    reason: 'tick',
    activeLayers: createActiveLayers([visualClip, audioClip], 1.5),
  });
  expect(audioSink.buffers).toHaveBeenCalledTimes(1);

  await adapter.syncLayers({
    timelineTime: fromSeconds(7),
    reason: 'gap',
    activeLayers: createActiveLayers([], 7),
  });
  expect(clearRect).toHaveBeenCalledWith(0, 0, 16, 9);
  expect(adapter.lastFrameTime).toBeNull();
});

test('createMediabunnyAdapter realigns active audio after a loop seek', async () => {
  const input = createMockInput({ videoTrack: null, audioTrack: createMockAudioTrack() });
  const audioContext = createMockAudioContext();
  const audioSink: MockAudioSink = {
    buffers: vi.fn(async function* (start: number, end: number) {
      yield {
        buffer: {} as AudioBuffer,
        timestamp: start,
        duration: end - start,
      };
    }),
  };
  const adapter = createMediabunnyAdapter({
    audio: { context: audioContext as unknown as AudioContext },
    mediabunny: createMockMediabunny([input], { audioSink }).module,
    sources: [urlSource('audio-source', 'https://media.example/audio.webm')],
  });
  const activeAudio = createActiveClip('audio', 'audio-source', 1);
  const activeLayers = createActiveLayers([activeAudio], 1);

  await adapter.seek(fromSeconds(1), activeLayers);
  expect(adapter.startClock(fromSeconds(1), 1)).toBe(true);
  await adapter.syncLayers({
    timelineTime: fromSeconds(1),
    reason: 'play',
    activeLayers,
  });
  await vi.waitFor(() => {
    expect(audioContext.createBufferSource).toHaveBeenCalledOnce();
  });
  const firstNode = audioContext.createBufferSource.mock.results[0]?.value;

  await adapter.seek(fromSeconds(1), activeLayers);
  expect(adapter.startClock(fromSeconds(1), 1)).toBe(true);
  await adapter.syncLayers({
    timelineTime: fromSeconds(1),
    reason: 'tick',
    activeLayers,
  });

  expect(firstNode?.stop).toHaveBeenCalledOnce();
  await vi.waitFor(() => {
    expect(audioContext.createBufferSource).toHaveBeenCalledTimes(2);
  });
});

test('createMediabunnyAdapter ignores a pending audio buffer after realignment', async () => {
  const input = createMockInput({ videoTrack: null, audioTrack: createMockAudioTrack() });
  const audioContext = createMockAudioContext();
  let resolveFirstBuffer = (_result: IteratorResult<MockWrappedAudioBuffer, void>) => {};
  const firstBuffer = new Promise<IteratorResult<MockWrappedAudioBuffer, void>>((resolve) => {
    resolveFirstBuffer = resolve;
  });
  let firstNextCount = 0;
  const firstNext = vi.fn(() => {
    firstNextCount += 1;
    return firstNextCount === 1
      ? firstBuffer
      : Promise.resolve({ done: true as const, value: undefined });
  });
  const firstIterator: AsyncGenerator<MockWrappedAudioBuffer, void, void> = {
    next: firstNext,
    return: vi.fn(async () => ({ done: true as const, value: undefined })),
    throw: vi.fn(async (iteratorError?: Error) => {
      throw iteratorError ?? new Error('Audio iterator failed.');
    }),
    [Symbol.asyncIterator]() {
      return this;
    },
    [Symbol.asyncDispose]: vi.fn(async () => {}),
  };
  let iteratorCount = 0;
  const audioSink: MockAudioSink = {
    buffers: vi.fn((start: number, end: number) => {
      iteratorCount += 1;
      if (iteratorCount === 1) {
        return firstIterator;
      }
      return (async function* () {
        yield {
          buffer: {} as AudioBuffer,
          timestamp: start,
          duration: end - start,
        };
      })();
    }),
  };
  const adapter = createMediabunnyAdapter({
    audio: { context: audioContext as unknown as AudioContext },
    mediabunny: createMockMediabunny([input], { audioSink }).module,
    sources: [urlSource('audio-source', 'https://media.example/audio.webm')],
  });
  const activeAudio = createActiveClip('audio', 'audio-source', 1);
  const activeLayers = createActiveLayers([activeAudio], 1);

  await adapter.seek(fromSeconds(1), activeLayers);
  expect(adapter.startClock(fromSeconds(1), 1)).toBe(true);
  await adapter.syncLayers({
    timelineTime: fromSeconds(1),
    reason: 'play',
    activeLayers,
  });
  await vi.waitFor(() => {
    expect(firstNext).toHaveBeenCalledOnce();
  });

  await adapter.seek(fromSeconds(1), activeLayers);
  expect(adapter.startClock(fromSeconds(1), 1)).toBe(true);
  await adapter.syncLayers({
    timelineTime: fromSeconds(1),
    reason: 'tick',
    activeLayers,
  });
  await vi.waitFor(() => {
    expect(audioContext.createBufferSource).toHaveBeenCalledOnce();
  });

  resolveFirstBuffer({
    done: false,
    value: {
      buffer: {} as AudioBuffer,
      timestamp: 21,
      duration: 4,
    },
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(audioContext.createBufferSource).toHaveBeenCalledOnce();
});

test('createMediabunnyAdapter ignores a cancelled audio iterator failure', async () => {
  const input = createMockInput({ videoTrack: null, audioTrack: createMockAudioTrack() });
  const audioContext = createMockAudioContext();
  let rejectStaleBuffer = (_error: Error) => {};
  let markStaleIteratorStarted = () => {};
  const staleIteratorStarted = new Promise<void>((resolve) => {
    markStaleIteratorStarted = resolve;
  });
  const staleBuffer = new Promise<MockWrappedAudioBuffer>((_resolve, reject) => {
    rejectStaleBuffer = reject;
  });
  let iteratorCount = 0;
  const audioSink: MockAudioSink = {
    buffers: vi.fn((start: number, end: number) => {
      iteratorCount += 1;
      if (iteratorCount === 1) {
        return (async function* () {
          markStaleIteratorStarted();
          yield await staleBuffer;
        })();
      }
      return (async function* () {
        yield {
          buffer: {} as AudioBuffer,
          timestamp: start,
          duration: end - start,
        };
      })();
    }),
  };
  const adapter = createMediabunnyAdapter({
    audio: { context: audioContext as unknown as AudioContext },
    mediabunny: createMockMediabunny([input], { audioSink }).module,
    sources: [urlSource('audio-source', 'https://media.example/audio.webm')],
  });
  const activeAudio = createActiveClip('audio', 'audio-source', 1);
  const activeLayers = createActiveLayers([activeAudio], 1);

  await adapter.seek(fromSeconds(1), activeLayers);
  expect(adapter.startClock(fromSeconds(1), 1)).toBe(true);
  await adapter.syncLayers({ timelineTime: fromSeconds(1), reason: 'play', activeLayers });
  await staleIteratorStarted;

  await adapter.seek(fromSeconds(1), activeLayers);
  expect(adapter.startClock(fromSeconds(1), 1)).toBe(true);
  await adapter.syncLayers({ timelineTime: fromSeconds(1), reason: 'tick', activeLayers });
  rejectStaleBuffer(new Error('cancelled iterator failed'));
  await Promise.resolve();
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

  expect(adapter.error).toBeNull();
  expect(adapter.sourceStateById.get('audio-source')?.status).toBe('ready');
});

test('createMediabunnyAdapter does not paint a frame after its controller is replaced', async () => {
  const initialInput = createMockInput();
  const replacementInput = createMockInput({ metadataDuration: 9 });
  const targetCanvas = document.createElement('canvas');
  const drawImage = vi.fn();
  vi.spyOn(targetCanvas, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  let resolveFrame = (_frame: Awaited<ReturnType<MockCanvasSink['getCanvas']>>) => {};
  const frame = new Promise<Awaited<ReturnType<MockCanvasSink['getCanvas']>>>((resolve) => {
    resolveFrame = resolve;
  });
  const canvasSink: MockCanvasSink = {
    getCanvas: vi.fn(() => frame),
    canvases: vi.fn(async function* () {}),
  };
  const adapter = createMediabunnyAdapter({
    canvas: targetCanvas,
    mediabunny: createMockMediabunny([initialInput, replacementInput], { canvasSink }).module,
    sources: [urlSource('source-1', 'https://media.example/original.mp4')],
  });
  const visualClip = createActiveClip('visual', 'source-1', 1);

  await waitForAdapterLoad(adapter);
  const pendingSeek = adapter.seek(fromSeconds(1), createActiveLayers([visualClip], 1));
  await vi.waitFor(() => {
    expect(canvasSink.getCanvas).toHaveBeenCalledOnce();
  });
  await expect(
    adapter.replaceSource(urlSource('source-1', 'https://media.example/replacement.mp4'))
  ).resolves.toMatchObject({ ok: true });

  resolveFrame({
    canvas: document.createElement('canvas'),
    timestamp: 11,
    duration: 1 / 30,
  });
  await pendingSeek;
  expect(drawImage).not.toHaveBeenCalled();
});

test('createMediabunnyAdapter does not return a frame after its controller is replaced', async () => {
  const initialInput = createMockInput();
  const replacementInput = createMockInput({ metadataDuration: 9 });
  let resolveFrame = (_frame: Awaited<ReturnType<MockCanvasSink['getCanvas']>>) => {};
  const frame = new Promise<Awaited<ReturnType<MockCanvasSink['getCanvas']>>>((resolve) => {
    resolveFrame = resolve;
  });
  const canvasSink: MockCanvasSink = {
    getCanvas: vi.fn(() => frame),
    canvases: vi.fn(async function* () {}),
  };
  const adapter = createMediabunnyAdapter({
    mediabunny: createMockMediabunny([initialInput, replacementInput], { canvasSink }).module,
    sources: [urlSource('source-1', 'https://media.example/original.mp4')],
  });
  const visualClip = createActiveClip('visual', 'source-1', 1);

  await waitForAdapterLoad(adapter);
  const pendingFrame = adapter.getFrame(visualClip);
  await vi.waitFor(() => {
    expect(canvasSink.getCanvas).toHaveBeenCalledOnce();
  });
  await expect(
    adapter.replaceSource(urlSource('source-1', 'https://media.example/replacement.mp4'))
  ).resolves.toMatchObject({ ok: true });

  resolveFrame({
    canvas: document.createElement('canvas'),
    timestamp: 11,
    duration: 1 / 30,
  });
  await expect(pendingFrame).resolves.toBeNull();
});

test('createMediabunnyAdapter samples sequential 24 fps frames on 30 fps playback ticks', async () => {
  const input = createMockInput();
  const targetCanvas = document.createElement('canvas');
  const drawImage = vi.fn();
  vi.spyOn(targetCanvas, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  let iteratorClosed = false;
  const sourceFrame = (timestamp: number) => ({
    canvas: document.createElement('canvas'),
    timestamp,
    duration: 1 / 24,
  });
  const canvasSink: MockCanvasSink = {
    getCanvas: vi.fn(async (timestamp) => sourceFrame(Math.floor(timestamp * 24) / 24)),
    canvases: vi.fn(async function* (start = 0, end = Number.POSITIVE_INFINITY) {
      try {
        for (let frame = Math.ceil(start * 24 - 1e-9); frame / 24 < end; frame += 1) {
          yield sourceFrame(frame / 24);
        }
      } finally {
        iteratorClosed = true;
      }
    }),
  };
  const adapter = createMediabunnyAdapter({
    audio: { context: createMockAudioContext() as unknown as AudioContext },
    canvas: targetCanvas,
    mediabunny: createMockMediabunny([input], { canvasSink }).module,
    sources: [urlSource('source-1', 'https://media.example/video.mp4')],
  });
  const renderedTimestamps: number[] = [];
  const unsubscribe = adapter.subscribeFrame(() => {
    if (adapter.lastFrameTime !== null) {
      renderedTimestamps.push(adapter.lastFrameTime);
    }
  });

  await waitForAdapterLoad(adapter);
  const initialClip = createActiveClip('visual', 'source-1', 1);
  await adapter.seek(fromSeconds(1), createActiveLayers([initialClip], 1));
  await adapter.syncLayers({
    timelineTime: fromSeconds(1),
    reason: 'play',
    activeLayers: createActiveLayers([initialClip], 1),
  });
  await vi.waitFor(() => {
    expect(canvasSink.canvases).toHaveBeenCalledWith(11, 15);
  });

  for (let projectFrame = 1; projectFrame <= 5; projectFrame += 1) {
    const timelineSeconds = 1 + projectFrame / 30;
    const visualClip = createActiveClip('visual', 'source-1', timelineSeconds);
    await adapter.syncLayers({
      timelineTime: fromSeconds(timelineSeconds),
      reason: 'tick',
      activeLayers: createActiveLayers([visualClip], timelineSeconds),
    });
    await Promise.resolve();
  }

  expect(canvasSink.getCanvas).toHaveBeenCalledTimes(1);
  expect(renderedTimestamps).toEqual([11, 11 + 1 / 24, 11 + 2 / 24, 11 + 3 / 24, 11 + 4 / 24]);
  expect(drawImage).toHaveBeenCalledTimes(5);

  adapter.stopClock();
  await vi.waitFor(() => {
    expect(iteratorClosed).toBe(true);
  });
  unsubscribe();
});

test('createMediabunnyAdapter handles audio-only content and missing render surfaces', async () => {
  const input = createMockInput({
    videoTrack: null,
    audioTrack: createMockAudioTrack(),
  });
  const audioSink: MockAudioSink = {
    buffers: vi.fn(async function* () {}),
  };
  const adapter = createMediabunnyAdapter({
    audio: { context: createMockAudioContext() as unknown as AudioContext },
    mediabunny: createMockMediabunny([input], { audioSink }).module,
    sources: [urlSource('audio-source', 'https://media.example/audio.webm')],
  });
  const audioClip = createActiveClip('audio', 'audio-source', 2);

  await waitForAdapterLoad(adapter);
  await adapter.seek(fromSeconds(2), createActiveLayers([audioClip], 2));

  expect(adapter.status).toBe('Audio-only region at playhead.');
  expect(adapter.getClockTime()).toBe(2);
  await adapter.renderVideo(createActiveClip('visual', 'audio-source', 2), fromSeconds(2));
  await expect(adapter.getFrame(createActiveClip('visual', 'audio-source', 2))).resolves.toBeNull();
});

test('createMediabunnyAdapter rejects audio-only sources the browser cannot decode', async () => {
  const undecodableAudio = {
    ...createMockAudioTrack(),
    canDecode: vi.fn(async () => false),
  };
  const adapter = createMediabunnyAdapter({
    mediabunny: createMockMediabunny([
      createMockInput({ videoTrack: null, audioTrack: undecodableAudio }),
    ]).module,
    sources: [urlSource('audio-source', 'https://media.example/audio.webm')],
  });

  await expect(adapter.preloadSource('audio-source')).resolves.toMatchObject({
    ok: false,
    reason: 'load-failed',
  });
  expect(adapter.sourceStateById.get('audio-source')).toMatchObject({
    status: 'failed',
    error: expect.objectContaining({
      message: 'The browser cannot decode the audio track for source "audio-source".',
    }),
  });
});

test('createMediabunnyAdapter exposes frame, clock, resume, and status contracts', async () => {
  const input = createMockInput({ audioTrack: createMockAudioTrack() });
  const audioContext = createMockAudioContext();
  audioContext.state = 'suspended';
  const canvasSink: MockCanvasSink = {
    getCanvas: vi.fn(async (timestamp) => ({
      canvas: document.createElement('canvas'),
      timestamp,
      duration: 1 / 30,
    })),
    canvases: vi.fn(async function* () {}),
  };
  const adapter = createMediabunnyAdapter({
    audio: { context: audioContext as unknown as AudioContext },
    mediabunny: createMockMediabunny([input], { canvasSink }).module,
    sources: [urlSource('source-1', 'https://media.example/video.mp4')],
  });
  const visualClip = createActiveClip('visual', 'source-1', 2);

  await waitForAdapterLoad(adapter);

  await adapter.seek(fromSeconds(2), createActiveLayers([visualClip], 2));

  expect(adapter.startClock(fromSeconds(2), 2)).toBe(true);
  expect(adapter.getClockTime()).toBeCloseTo(2, 1);
  adapter.requestClockActivation(2);
  await Promise.resolve();
  expect(audioContext.resume).toHaveBeenCalled();
  adapter.setClockRate(0.5);
  adapter.stopClock();
  expect(adapter.getClockTime()).toBeGreaterThanOrEqual(2);

  await expect(adapter.getFrame(visualClip)).resolves.toMatchObject({ timestamp: 12 });
  await expect(
    adapter.getFrame(createActiveClip('visual', 'missing-source', 2))
  ).resolves.toBeNull();

  adapter.onStatus('playing');
  expect(adapter.status).toBe('Mediabunny is driving timeline media playback.');
  adapter.onStatus('content-gap');
  expect(adapter.status).toBe('Reached the next content gap.');
  adapter.onStatus('paused');
  expect(adapter.status).toBe('Paused. Timeline edits seek Mediabunny frames.');
});

test('createMediabunnyAdapter handles null decoded frames and late audio scheduling', async () => {
  const input = createMockInput({ audioTrack: createMockAudioTrack() });
  const audioContext = createMockAudioContext();
  const startedNodes: AudioBufferSourceNode[] = [];
  const startedNodeStartMocks: Array<ReturnType<typeof vi.fn>> = [];
  audioContext.createBufferSource = vi.fn(() => {
    const startMock = vi.fn();
    const node = {
      buffer: null,
      playbackRate: { value: 1 },
      connect: vi.fn(),
      start: startMock,
      stop: vi.fn(),
      onended: null,
    } as unknown as AudioBufferSourceNode;
    startedNodes.push(node);
    startedNodeStartMocks.push(startMock);
    return node;
  });
  const canvasSink: MockCanvasSink = {
    getCanvas: vi.fn(async () => null),
    canvases: vi.fn(async function* () {}),
  };
  const audioSink: MockAudioSink = {
    buffers: vi.fn(async function* (start: number) {
      yield {
        buffer: {} as AudioBuffer,
        timestamp: start,
        duration: 0.1,
      };
    }),
  };
  const adapter = createMediabunnyAdapter({
    audio: { context: audioContext as unknown as AudioContext },
    mediabunny: createMockMediabunny([input], { audioSink, canvasSink }).module,
    sources: [urlSource('source-1', 'https://media.example/video.mp4')],
  });
  const visualClip = createActiveClip('visual', 'source-1', 1);
  const audioClip = createActiveClip('audio', 'source-1', 1);

  await waitForAdapterLoad(adapter);
  await expect(adapter.getFrame(visualClip)).resolves.toBeNull();
  await adapter.seek(fromSeconds(1), createActiveLayers([visualClip, audioClip], 1));
  adapter.startClock(fromSeconds(1), 1);
  audioContext.currentTime = 30;
  adapter.syncAudio(audioClip, fromSeconds(1), 'play');
  await vi.waitFor(() => {
    expect(startedNodes).toHaveLength(1);
  });

  expect(startedNodeStartMocks[0]).toHaveBeenCalledWith(30, 20);
});

test('createMediabunnyAdapter rejects undecodable video and permits video without AudioContext', async () => {
  const undecodableInput = createMockInput({
    videoTrack: {
      ...createMockVideoTrack(),
      canDecode: vi.fn(async () => false),
    },
  });
  const undecodableAdapter = createMediabunnyAdapter({
    audio: { context: createMockAudioContext() as unknown as AudioContext },
    mediabunny: createMockMediabunny([undecodableInput]).module,
    sources: [urlSource('bad-video', 'https://media.example/bad.mp4')],
  });

  await waitForAdapterLoad(undecodableAdapter);
  expect(undecodableAdapter.error?.message).toBe(
    'The browser cannot decode the video track for source "bad-video".'
  );

  const previousAudioContext = window.AudioContext;
  const previousWebkitAudioContext = (
    window as typeof window & { webkitAudioContext?: typeof AudioContext }
  ).webkitAudioContext;
  window.AudioContext = undefined as unknown as typeof AudioContext;
  (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext =
    undefined;
  const noAudioContextAdapter = createMediabunnyAdapter({
    mediabunny: createMockMediabunny([createMockInput({ audioTrack: createMockAudioTrack() })])
      .module,
    sources: [urlSource('no-audio-context', 'https://media.example/video.mp4')],
  });

  await waitForAdapterLoad(noAudioContextAdapter);
  expect(noAudioContextAdapter.ready).toBe(true);
  expect(noAudioContextAdapter.error).toBeNull();
  expect(noAudioContextAdapter.audioStatus).toMatchObject({ state: 'degraded' });
  window.AudioContext = previousAudioContext;
  (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext =
    previousWebkitAudioContext;

  const moduleWithoutBlobSource = {
    ...createMockMediabunny([]).module,
    BlobSource: undefined,
  } as unknown as MediabunnyModule;
  const missingBlobSourceAdapter = createMediabunnyAdapter({
    mediabunny: moduleWithoutBlobSource,
    sources: [
      {
        sourceId: 'local-file',
        input: new Blob(['sample']),
      },
    ],
  });

  await waitForAdapterLoad(missingBlobSourceAdapter);
  expect(missingBlobSourceAdapter.error?.message).toBe(
    'This Mediabunny version does not expose BlobSource for local files.'
  );
});

test('createMediabunnyAdapter exposes selected-track metadata and runtime audio controls', async () => {
  const videoTrack = createMockVideoTrack();
  const audioTrack = createMockAudioTrack();
  const input = createMockInput({
    videoTrack,
    audioTrack,
    firstTimestamp: 12,
    metadataDuration: 20,
  });
  const audioContext = createMockAudioContext();
  const adapter = createMediabunnyAdapter({
    audio: { context: audioContext as unknown as AudioContext, volume: 0.5 },
    mediabunny: createMockMediabunny([input]).module,
    sources: [urlSource('source-1', 'https://media.example/video.mp4')],
    selectTracks: ({ videoTracks, audioTracks }) => ({
      videoTrack: videoTracks[0] ?? null,
      audioTrack: audioTracks[0] ?? null,
    }),
  });

  await waitForAdapterLoad(adapter);
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    selectedInputIndex: 0,
    metadata: {
      firstTimestampSeconds: 12,
      presentationStartTimestampSeconds: 12,
      endTimestampSeconds: 20,
      durationSeconds: 8,
      video: { displayWidth: 1920, displayHeight: 1080, detectedFrameRate: 30 },
      audio: { sampleRate: 48_000 },
    },
  });

  const gainNode = audioContext.createGain.mock.results[0]?.value;
  expect(gainNode?.gain.value).toBe(0.5);
  adapter.setMuted(true);
  expect(gainNode?.gain.value).toBe(0);
  adapter.setVolume(0.25);
  adapter.setMuted(false);
  expect(gainNode?.gain.value).toBe(0.25);
  adapter.dispose();
  expect(audioContext.close).not.toHaveBeenCalled();
});

test('createMediabunnyAdapter reports pending audio activation without blocking playback', async () => {
  vi.useFakeTimers();
  const input = createMockInput({ audioTrack: createMockAudioTrack() });
  const audioContext = createMockAudioContext();
  audioContext.state = 'suspended';
  audioContext.resume = vi.fn(() => new Promise<void>(() => {}));
  const adapter = createMediabunnyAdapter({
    audio: {
      context: audioContext as unknown as AudioContext,
      activationTimeoutMs: 25,
    },
    mediabunny: createMockMediabunny([input]).module,
    sources: [urlSource('source-1', 'https://media.example/video.mp4')],
  });

  await waitForAdapterLoad(adapter);
  await adapter.seek(
    fromSeconds(0),
    createActiveLayers([createActiveClip('audio', 'source-1', 0)], 0)
  );
  adapter.requestClockActivation(1);
  expect(adapter.startClock(fromSeconds(0), 1)).toBe(true);
  await vi.advanceTimersByTimeAsync(25);
  expect(adapter.audioStatus).toEqual({ state: 'degraded', error: null });
  adapter.dispose();
  vi.useRealTimers();
});

test('createMediabunnyAdapter reschedules active audio after delayed activation', async () => {
  const input = createMockInput({ videoTrack: null, audioTrack: createMockAudioTrack() });
  const audioContext = createMockAudioContext();
  audioContext.state = 'suspended';
  let resolveResume = () => {};
  audioContext.resume = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveResume = () => {
          audioContext.state = 'running';
          resolve();
        };
      })
  );
  const adapter = createMediabunnyAdapter({
    audio: { context: audioContext as unknown as AudioContext },
    mediabunny: createMockMediabunny([input]).module,
    sources: [urlSource('audio-source', 'https://media.example/audio.webm')],
  });
  const activeAudio = createActiveClip('audio', 'audio-source', 0);
  const activeLayers = createActiveLayers([activeAudio], 0);

  await adapter.seek(fromSeconds(0), activeLayers);
  adapter.requestClockActivation(1);
  expect(adapter.startClock(fromSeconds(0), 1)).toBe(true);
  await adapter.syncLayers({
    timelineTime: fromSeconds(0),
    reason: 'play',
    activeLayers,
  });
  await vi.waitFor(() => {
    expect(audioContext.createBufferSource).toHaveBeenCalledOnce();
  });
  const firstNode = audioContext.createBufferSource.mock.results[0]?.value;

  resolveResume();
  await vi.waitFor(() => {
    expect(adapter.audioStatus).toEqual({ state: 'running' });
    expect(firstNode?.stop).toHaveBeenCalledOnce();
  });

  await adapter.syncLayers({
    timelineTime: fromSeconds(0),
    reason: 'tick',
    activeLayers,
  });
  await vi.waitFor(() => {
    expect(audioContext.createBufferSource).toHaveBeenCalledTimes(2);
  });
});

test('createMediabunnyAdapter defers audio activation until an audio track loads', async () => {
  const audioContext = createMockAudioContext();
  audioContext.state = 'suspended';
  const adapter = createMediabunnyAdapter({
    audio: { context: audioContext as unknown as AudioContext },
    mediabunny: createMockMediabunny([
      createMockInput({ videoTrack: null, audioTrack: createMockAudioTrack() }),
    ]).module,
    sources: [urlSource('audio-source', 'https://media.example/audio.webm')],
  });

  adapter.requestClockActivation(1);
  expect(audioContext.resume).not.toHaveBeenCalled();
  await adapter.preloadSource('audio-source');
  await Promise.resolve();

  expect(audioContext.resume).toHaveBeenCalledTimes(1);
  expect(adapter.audioStatus).toEqual({ state: 'running' });
});

test('createMediabunnyAdapter does not activate caller audio for video-only media', async () => {
  const audioContext = createMockAudioContext();
  audioContext.state = 'suspended';
  const adapter = createMediabunnyAdapter({
    audio: { context: audioContext as unknown as AudioContext },
    mediabunny: createMockMediabunny([createMockInput({ audioTrack: null })]).module,
    sources: [urlSource('video-source', 'https://media.example/video.mp4')],
  });

  adapter.requestClockActivation(1);
  await adapter.preloadSource('video-source');
  await Promise.resolve();

  expect(audioContext.resume).not.toHaveBeenCalled();
  expect(adapter.audioStatus).toEqual({ state: 'unavailable' });
});

test('createMediabunnyAdapter keeps transport time continuous across lazy source loads', async () => {
  let nowMilliseconds = 1_000;
  vi.spyOn(performance, 'now').mockImplementation(() => nowMilliseconds);
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  const adapter = createMediabunnyAdapter({
    canvas,
    mediabunny: createMockMediabunny([createMockInput(), createMockInput()]).module,
    sources: [
      urlSource('source-1', 'https://media.example/one.mp4'),
      urlSource('source-2', 'https://media.example/two.mp4'),
    ],
  });
  const firstClip = createActiveClip('visual', 'source-1', 5);
  await adapter.seek(fromSeconds(5), createActiveLayers([firstClip], 5));
  expect(adapter.startClock(fromSeconds(5), 1)).toBe(true);

  nowMilliseconds = 2_000;
  expect(adapter.getClockTime()).toBe(6);
  const secondClip = createActiveClip('visual', 'source-2', 6);
  await adapter.syncLayers({
    timelineTime: fromSeconds(6),
    reason: 'tick',
    activeLayers: createActiveLayers([secondClip], 6),
  });
  expect(adapter.sourceStateById.get('source-2')?.status).toBe('ready');
  expect(adapter.getClockTime()).toBe(6);

  nowMilliseconds = 2_500;
  expect(adapter.getClockTime()).toBe(6.5);
});

test('createMediabunnyAdapter closes only an adapter-owned audio context', async () => {
  const ownedContext = createMockAudioContext();
  class OwnedAudioContextConstructor {
    constructor() {
      return ownedContext;
    }
  }
  window.AudioContext = OwnedAudioContextConstructor as unknown as typeof AudioContext;
  const adapter = createMediabunnyAdapter({
    mediabunny: createMockMediabunny([createMockInput({ audioTrack: createMockAudioTrack() })])
      .module,
    sources: [urlSource('source-1', 'https://media.example/video.mp4')],
  });

  await waitForAdapterLoad(adapter);
  adapter.dispose();
  adapter.dispose();
  expect(ownedContext.close).toHaveBeenCalledTimes(1);
  const gainNode = ownedContext.createGain.mock.results[0]?.value;
  expect(gainNode?.disconnect).toHaveBeenCalledTimes(1);
});

test('createMediabunnyAdapter falls back after a runtime video iterator failure', async () => {
  let nowMilliseconds = 1_000;
  vi.spyOn(performance, 'now').mockImplementation(() => nowMilliseconds);
  const firstInput = createMockInput();
  const fallbackInput = createMockInput();
  let iteratorCount = 0;
  const canvasSink: MockCanvasSink = {
    getCanvas: vi.fn(async (timestamp) => ({
      canvas: document.createElement('canvas'),
      timestamp,
      duration: 1 / 30,
    })),
    canvases: vi.fn(async function* () {
      iteratorCount += 1;
      if (iteratorCount === 1) {
        throw new Error('decoder failed');
      }
      yield {
        canvas: document.createElement('canvas'),
        timestamp: 1,
        duration: 1 / 30,
      };
    }),
  };
  const adapter = createMediabunnyAdapter({
    canvas: document.createElement('canvas'),
    mediabunny: createMockMediabunny([firstInput, fallbackInput], { canvasSink }).module,
    sources: [
      {
        sourceId: 'source-1',
        input: { kind: 'url', url: 'https://media.example/primary.mp4' },
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
    expect(adapter.sourceStateById.get('source-1')?.selectedInputIndex).toBe(1);
  });
  nowMilliseconds = 2_000;
  expect(adapter.getClockTime()).toBe(2);
});
