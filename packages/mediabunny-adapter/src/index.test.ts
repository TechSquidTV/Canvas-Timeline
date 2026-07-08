import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import type { ActiveClip, ActiveLayerResult, Clip, Track } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import * as RealMediabunny from 'mediabunny';
import {
  createMediabunnyAdapter,
  formatMediabunnyTime,
  type MediabunnyModule,
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
};

type MockAudioTrack = {
  getCodec: ReturnType<typeof vi.fn<() => Promise<string | null>>>;
  canDecode: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  getSampleRate: ReturnType<typeof vi.fn<() => Promise<number>>>;
};

type MockInput = {
  getPrimaryVideoTrack: ReturnType<typeof vi.fn<() => Promise<MockVideoTrack | null>>>;
  getPrimaryAudioTrack: ReturnType<typeof vi.fn<() => Promise<MockAudioTrack | null>>>;
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

function waitForAdapterLoad(adapter: ReturnType<typeof createMediabunnyAdapter>) {
  return vi.waitFor(() => {
    expect(adapter.status).not.toBe('Loading Mediabunny sources...');
  });
}

function createMockVideoTrack(): MockVideoTrack {
  return {
    getCodec: vi.fn(async () => 'vp09'),
    canDecode: vi.fn(async () => true),
    canBeTransparent: vi.fn(async () => false),
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
  const createdUrlSources: string[] = [];
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
    constructor(url: string) {
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
    syncKey: `${trackKind}:${sourceId}:${timelineSeconds}`,
  };
}

function createActiveLayers(activeClips: ActiveClip[], time = 1): ActiveLayerResult<string> {
  return createActiveLayerResult(activeClips, time);
}

test('formatMediabunnyTime formats finite and invalid values', () => {
  expect(formatMediabunnyTime(1.234)).toBe('1.23s');
  expect(formatMediabunnyTime(Number.NaN)).toBe('0.00s');
});

test('createMediabunnyAdapter loads url, blob, input, and createInput sources', async () => {
  const blob = new Blob(['sample']);
  const urlInput = createMockInput({ metadataDuration: 4 });
  const blobInput = createMockInput({ metadataDuration: 5 });
  const providedInput = createMockInput({ metadataDuration: 6 });
  const createdInput = createMockInput({ metadataDuration: null, computedDuration: 7 });
  const mockMediabunny = createMockMediabunny([urlInput, blobInput]);
  const adapter = createMediabunnyAdapter({
    audio: { context: createMockAudioContext() as unknown as AudioContext },
    mediabunny: mockMediabunny.module,
    sources: [
      { id: 'url-source', url: 'https://media.example/video.mp4' },
      { id: 'blob-source', blob },
      { id: 'input-source', input: providedInput as unknown as RealMediabunny.Input },
      {
        id: 'created-source',
        createInput: (mediabunny) => {
          expect(mediabunny).toBe(mockMediabunny.module);
          return createdInput as unknown as RealMediabunny.Input;
        },
      },
    ],
  });

  await waitForAdapterLoad(adapter);

  expect(adapter.ready).toBe(true);
  expect(adapter.status).toBe('Ready. Mediabunny can drive timeline video and audio.');
  expect(adapter.durationBySourceId.get('url-source')).toBe(4);
  expect(adapter.durationBySourceId.get('blob-source')).toBe(5);
  expect(adapter.durationBySourceId.get('input-source')).toBe(6);
  expect(adapter.durationBySourceId.get('created-source')).toBe(7);
  expect(mockMediabunny.createdUrlSources).toEqual(['https://media.example/video.mp4']);
  expect(mockMediabunny.createdBlobSources).toEqual([blob]);

  adapter.dispose();
  expect(urlInput.dispose).toHaveBeenCalled();
  expect(blobInput.dispose).toHaveBeenCalled();
  expect(providedInput.dispose).not.toHaveBeenCalled();
  expect(createdInput.dispose).toHaveBeenCalled();
});

test('createMediabunnyAdapter ignores duplicate source ids and surfaces load failures', async () => {
  const firstInput = createMockInput({ metadataDuration: 4 });
  const duplicateInput = createMockInput({ metadataDuration: 9 });
  const mockMediabunny = createMockMediabunny([firstInput, duplicateInput]);
  const adapter = createMediabunnyAdapter({
    audio: { context: createMockAudioContext() as unknown as AudioContext },
    mediabunny: mockMediabunny.module,
    sources: [
      { id: 'same-source', url: 'https://media.example/first.mp4' },
      { id: 'same-source', url: 'https://media.example/second.mp4' },
    ],
  });

  await waitForAdapterLoad(adapter);

  expect(adapter.durationBySourceId.get('same-source')).toBe(4);
  expect(mockMediabunny.createdUrlSources).toEqual(['https://media.example/first.mp4']);
  expect(duplicateInput.getPrimaryVideoTrack).not.toHaveBeenCalled();

  const failedInput = createMockInput({ videoTrack: null, audioTrack: null });
  const failingAdapter = createMediabunnyAdapter({
    audio: { context: createMockAudioContext() as unknown as AudioContext },
    mediabunny: createMockMediabunny([failedInput]).module,
    sources: [{ id: 'empty-source', url: 'https://media.example/empty.mp4' }],
  });

  await waitForAdapterLoad(failingAdapter);

  expect(failingAdapter.ready).toBe(false);
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
  expect(emptyAdapter.status).toBe('No Mediabunny source could be loaded.');
});

test('createMediabunnyAdapter ignores async load completion after disposal', async () => {
  let resolveInput: (input: RealMediabunny.Input) => void = () => {};
  const inputPromise = new Promise<RealMediabunny.Input>((resolve) => {
    resolveInput = resolve;
  });
  const adapter = createMediabunnyAdapter({
    audio: { context: createMockAudioContext() as unknown as AudioContext },
    mediabunny: createMockMediabunny([]).module,
    sources: [{ id: 'slow-source', createInput: () => inputPromise }],
  });

  adapter.dispose();
  resolveInput(createMockInput() as unknown as RealMediabunny.Input);
  await new Promise((resolve) => window.setTimeout(resolve, 0));

  expect(adapter.ready).toBe(false);
  expect(adapter.status).toBe('Loading Mediabunny sources...');
  expect(adapter.durationBySourceId.size).toBe(0);
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
    sources: [{ id: 'source-1', url: 'https://media.example/video.mp4' }],
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
    sources: [{ id: 'audio-source', url: 'https://media.example/audio.webm' }],
  });
  const audioClip = createActiveClip('audio', 'audio-source', 2);

  await waitForAdapterLoad(adapter);
  await adapter.seek(fromSeconds(2), createActiveLayers([audioClip], 2));

  expect(adapter.status).toBe('Audio-only region at playhead.');
  expect(adapter.getClockTime()).toBe(2);
  await adapter.renderVideo(createActiveClip('visual', 'audio-source', 2), fromSeconds(2));
  await expect(adapter.getFrame(createActiveClip('visual', 'audio-source', 2))).resolves.toBeNull();
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
  };
  const adapter = createMediabunnyAdapter({
    audio: { context: audioContext as unknown as AudioContext },
    mediabunny: createMockMediabunny([input], { canvasSink }).module,
    sources: [{ id: 'source-1', url: 'https://media.example/video.mp4' }],
  });
  const visualClip = createActiveClip('visual', 'source-1', 2);

  await waitForAdapterLoad(adapter);

  expect(adapter.startClock(fromSeconds(2), 2)).toBe(true);
  expect(adapter.getClockTime()).toBeCloseTo(2, 1);
  await adapter.resumeClock(2);
  expect(audioContext.resume).toHaveBeenCalled();
  adapter.setClockRate(0.5);
  adapter.stopClock();
  expect(adapter.getClockTime()).toBeGreaterThanOrEqual(2);

  await expect(adapter.getFrame(visualClip)).resolves.toMatchObject({ timestamp: 12 });
  await expect(
    adapter.getFrame(createActiveClip('visual', 'missing-source', 2))
  ).resolves.toBeNull();

  adapter.syncAdapter.onStatus?.('playing');
  expect(adapter.status).toBe('Mediabunny is driving timeline media playback.');
  adapter.syncAdapter.onStatus?.('content-gap');
  expect(adapter.status).toBe('Reached the next content gap.');
  adapter.syncAdapter.onStatus?.('paused');
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
    sources: [{ id: 'source-1', url: 'https://media.example/video.mp4' }],
  });
  const visualClip = createActiveClip('visual', 'source-1', 1);
  const audioClip = createActiveClip('audio', 'source-1', 1);

  await waitForAdapterLoad(adapter);
  await expect(adapter.getFrame(visualClip)).resolves.toBeNull();
  adapter.startClock(fromSeconds(1), 1);
  audioContext.currentTime = 30;
  adapter.syncAudio(audioClip, fromSeconds(1), 'play');
  await vi.waitFor(() => {
    expect(startedNodes).toHaveLength(1);
  });

  expect(startedNodeStartMocks[0]).toHaveBeenCalledWith(30, 20);
});

test('createMediabunnyAdapter rejects undecodable video and missing AudioContext', async () => {
  const undecodableInput = createMockInput({
    videoTrack: {
      ...createMockVideoTrack(),
      canDecode: vi.fn(async () => false),
    },
  });
  const undecodableAdapter = createMediabunnyAdapter({
    audio: { context: createMockAudioContext() as unknown as AudioContext },
    mediabunny: createMockMediabunny([undecodableInput]).module,
    sources: [{ id: 'bad-video', url: 'https://media.example/bad.mp4' }],
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
    mediabunny: createMockMediabunny([createMockInput()]).module,
    sources: [{ id: 'no-audio-context', url: 'https://media.example/video.mp4' }],
  });

  await waitForAdapterLoad(noAudioContextAdapter);
  expect(noAudioContextAdapter.error?.message).toBe('This browser does not expose AudioContext.');
  window.AudioContext = previousAudioContext;
  (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext =
    previousWebkitAudioContext;

  const moduleWithoutBlobSource = {
    ...createMockMediabunny([]).module,
    BlobSource: undefined,
  } as unknown as MediabunnyModule;
  const missingBlobSourceAdapter = createMediabunnyAdapter({
    mediabunny: moduleWithoutBlobSource,
    sources: [{ id: 'local-file', blob: new Blob(['sample']) }],
  });

  await waitForAdapterLoad(missingBlobSourceAdapter);
  expect(missingBlobSourceAdapter.error?.message).toBe(
    'This Mediabunny version does not expose BlobSource for local files.'
  );
});
