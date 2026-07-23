import { expect, test, vi } from 'vite-plus/test';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { createMediabunnyAdapter, type MediabunnyModule } from '#mediabunny-adapter/index';
import {
  mediabunnyTestFixtures,
  type MockVideoTrack,
  type MockCanvasSink,
  type MockAudioSink,
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

test('createMediabunnyAdapter refreshes paused frames after replacement and reconciliation', async () => {
  const initialInput = createMockInput();
  const replacementInput = createMockInput({ metadataDuration: 9 });
  const reconciledInput = createMockInput({ metadataDuration: 12 });
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
  const replacementCanvas = document.createElement('canvas');
  const reconciledCanvas = document.createElement('canvas');
  const canvasSink: MockCanvasSink = {
    getCanvas: vi
      .fn()
      .mockImplementationOnce(() => frame)
      .mockResolvedValueOnce({ canvas: replacementCanvas, timestamp: 11, duration: 1 / 30 })
      .mockResolvedValueOnce({ canvas: reconciledCanvas, timestamp: 11, duration: 1 / 30 }),
    canvases: vi.fn(async function* () {}),
  };
  const adapter = createMediabunnyAdapter({
    canvas: targetCanvas,
    mediabunny: createMockMediabunny([initialInput, replacementInput, reconciledInput], {
      canvasSink,
    }).module,
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
  await vi.waitFor(() => {
    expect(drawImage).toHaveBeenCalledWith(replacementCanvas, 0, 0);
  });

  resolveFrame({
    canvas: document.createElement('canvas'),
    timestamp: 11,
    duration: 1 / 30,
  });
  await pendingSeek;
  expect(drawImage).toHaveBeenCalledTimes(1);

  adapter.setSources([urlSource('source-1', 'https://media.example/reconciled.mp4')]);
  await vi.waitFor(() => {
    expect(canvasSink.getCanvas).toHaveBeenCalledTimes(3);
    expect(drawImage).toHaveBeenCalledTimes(2);
  });

  expect(drawImage.mock.calls[1]?.[0]).toBe(reconciledCanvas);
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'ready',
    metadata: { durationSeconds: 12 },
  });
});

test('createMediabunnyAdapter invalidates and refreshes paused rendering after canvas replacement', async () => {
  const input = createMockInput();
  const previousCanvas = document.createElement('canvas');
  const nextCanvas = document.createElement('canvas');
  const previousDrawImage = vi.fn();
  const nextDrawImage = vi.fn();
  vi.spyOn(previousCanvas, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    drawImage: previousDrawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(nextCanvas, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    drawImage: nextDrawImage,
  } as unknown as CanvasRenderingContext2D);
  let resolvePreviousFrame = (_frame: MockWrappedCanvas) => {};
  let resolveNextFrame = (_frame: MockWrappedCanvas) => {};
  const previousFrame = new Promise<MockWrappedCanvas>((resolve) => {
    resolvePreviousFrame = resolve;
  });
  const nextFrame = new Promise<MockWrappedCanvas>((resolve) => {
    resolveNextFrame = resolve;
  });
  const canvasSink: MockCanvasSink = {
    getCanvas: vi
      .fn()
      .mockImplementationOnce(() => previousFrame)
      .mockImplementationOnce(() => nextFrame),
    canvases: vi.fn(async function* () {}),
  };
  const adapter = createMediabunnyAdapter({
    canvas: previousCanvas,
    mediabunny: createMockMediabunny([input], { canvasSink }).module,
    sources: [urlSource('source-1', 'https://media.example/video.mp4')],
  });
  const visualClip = createActiveClip('visual', 'source-1', 1);

  await waitForAdapterLoad(adapter);
  const pendingSeek = adapter.seek(fromSeconds(1), createActiveLayers([visualClip], 1));
  await vi.waitFor(() => {
    expect(canvasSink.getCanvas).toHaveBeenCalledOnce();
  });

  adapter.setCanvas(nextCanvas);
  resolvePreviousFrame({
    canvas: document.createElement('canvas'),
    timestamp: 11,
    duration: 1 / 30,
  });
  await vi.waitFor(() => {
    expect(canvasSink.getCanvas).toHaveBeenCalledTimes(2);
  });
  resolveNextFrame({
    canvas: document.createElement('canvas'),
    timestamp: 11,
    duration: 1 / 30,
  });
  await pendingSeek;

  expect(previousDrawImage).not.toHaveBeenCalled();
  expect(nextDrawImage).toHaveBeenCalledOnce();
  expect(adapter.lastFrameTime).toBe(11);
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
  expect(adapter.getClockTime()).toBeCloseTo(2, 2);
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

test('createMediabunnyAdapter lets a newer active-source request supersede a delayed request', async () => {
  const firstInput = createMockInput();
  const secondInput = createMockInput();
  let resolveFirstTrack = (_track: MockVideoTrack | null) => {};
  firstInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((resolve) => {
        resolveFirstTrack = resolve;
      })
  );
  const paintedTimestamps: number[] = [];
  const previewCanvas = document.createElement('canvas');
  vi.spyOn(previewCanvas, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    drawImage: vi.fn((_canvas: CanvasImageSource, timestamp: number) => {
      paintedTimestamps.push(timestamp);
    }),
  } as unknown as CanvasRenderingContext2D);
  const canvasSink: MockCanvasSink = {
    getCanvas: vi.fn(async (timestamp) => ({
      canvas: document.createElement('canvas'),
      timestamp,
      duration: 1 / 30,
    })),
    canvases: vi.fn(async function* () {}),
  };
  const adapter = createMediabunnyAdapter({
    canvas: previewCanvas,
    mediabunny: createMockMediabunny([firstInput, secondInput], { canvasSink }).module,
    sources: [
      urlSource('source-a', 'https://media.example/a.mp4'),
      urlSource('source-b', 'https://media.example/b.mp4'),
    ],
  });
  const firstVisual = createActiveClip('visual', 'source-a', 1);
  const secondVisual = createActiveClip('visual', 'source-b', 2);

  const firstSync = adapter.syncLayers({
    timelineTime: fromSeconds(1),
    reason: 'pause',
    activeLayers: createActiveLayers([firstVisual], 1),
  });
  await vi.waitFor(() => {
    expect(firstInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });

  await adapter.syncLayers({
    timelineTime: fromSeconds(2),
    reason: 'pause',
    activeLayers: createActiveLayers([secondVisual], 2),
  });
  resolveFirstTrack(createMockVideoTrack());
  await firstSync;

  expect(canvasSink.getCanvas).toHaveBeenCalledTimes(1);
  expect(adapter.lastFrameTime).toBe(12);
});

test('createMediabunnyAdapter keeps the latest rate when delayed audio activation completes', async () => {
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
    sources: [urlSource('source-1', 'https://media.example/audio.webm')],
  });
  const activeAudio = createActiveClip('audio', 'source-1', 0);

  await adapter.seek(fromSeconds(0), createActiveLayers([activeAudio], 0));
  adapter.requestClockActivation(1);
  expect(adapter.startClock(fromSeconds(0), 1)).toBe(true);
  adapter.setClockRate(2);
  resolveResume();
  await vi.waitFor(() => {
    expect(adapter.audioStatus).toEqual({ state: 'running' });
  });

  audioContext.currentTime += 1;
  expect(adapter.getClockTime()).toBeCloseTo(2, 2);
});

test('createMediabunnyAdapter prevents a pending frame from repainting after clearVideo', async () => {
  const firstInput = createMockInput();
  const secondInput = createMockInput({ videoTrack: null, audioTrack: createMockAudioTrack() });
  let resolveFrame = (_frame: MockWrappedCanvas | null) => {};
  const pendingFrame = new Promise<MockWrappedCanvas | null>((resolve) => {
    resolveFrame = resolve;
  });
  const drawImage = vi.fn();
  const previewCanvas = document.createElement('canvas');
  vi.spyOn(previewCanvas, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  const canvasSink: MockCanvasSink = {
    getCanvas: vi.fn(() => pendingFrame),
    canvases: vi.fn(async function* () {}),
  };
  const adapter = createMediabunnyAdapter({
    canvas: previewCanvas,
    audio: { context: createMockAudioContext() as unknown as AudioContext },
    mediabunny: createMockMediabunny([firstInput, secondInput], { canvasSink }).module,
    sources: [
      urlSource('visual-source', 'https://media.example/video.mp4'),
      urlSource('audio-source', 'https://media.example/audio.webm'),
    ],
  });
  await waitForAdapterLoad(adapter);

  const render = adapter.renderVideo(
    createActiveClip('visual', 'visual-source', 1),
    fromSeconds(1)
  );
  let renderSettled = false;
  void render.then(() => {
    renderSettled = true;
  });
  await vi.waitFor(() => {
    expect(canvasSink.getCanvas).toHaveBeenCalledOnce();
  });
  adapter.syncAudio(createActiveClip('audio', 'audio-source', 1), fromSeconds(1), 'play');
  adapter.clearVideo();
  await vi.waitFor(() => {
    expect(renderSettled).toBe(true);
  });
  resolveFrame({
    canvas: document.createElement('canvas'),
    timestamp: 11,
    duration: 1 / 30,
  });
  await render;

  expect(drawImage).not.toHaveBeenCalled();
  expect(adapter.lastFrameTime).toBeNull();
});

test('createMediabunnyAdapter awaits the newest coalesced frame request', async () => {
  const input = createMockInput();
  let resolveFirstFrame = (_frame: MockWrappedCanvas | null) => {};
  const firstFrame = new Promise<MockWrappedCanvas | null>((resolve) => {
    resolveFirstFrame = resolve;
  });
  const secondCanvas = document.createElement('canvas');
  const drawImage = vi.fn();
  const previewCanvas = document.createElement('canvas');
  vi.spyOn(previewCanvas, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  const canvasSink: MockCanvasSink = {
    getCanvas: vi
      .fn()
      .mockImplementationOnce(() => firstFrame)
      .mockResolvedValueOnce({ canvas: secondCanvas, timestamp: 12, duration: 1 / 30 }),
    canvases: vi.fn(async function* () {}),
  };
  const adapter = createMediabunnyAdapter({
    canvas: previewCanvas,
    mediabunny: createMockMediabunny([input], { canvasSink }).module,
    sources: [urlSource('source-1', 'https://media.example/video.mp4')],
  });
  await waitForAdapterLoad(adapter);

  const firstRender = adapter.renderVideo(
    createActiveClip('visual', 'source-1', 1),
    fromSeconds(1)
  );
  await vi.waitFor(() => {
    expect(canvasSink.getCanvas).toHaveBeenCalledOnce();
  });
  let secondSettled = false;
  const secondRender = adapter
    .renderVideo(createActiveClip('visual', 'source-1', 2), fromSeconds(2))
    .then(() => {
      secondSettled = true;
    });
  await Promise.resolve();
  expect(secondSettled).toBe(false);

  resolveFirstFrame({
    canvas: document.createElement('canvas'),
    timestamp: 11,
    duration: 1 / 30,
  });
  await Promise.all([firstRender, secondRender]);

  expect(drawImage).toHaveBeenCalledTimes(1);
  expect(drawImage).toHaveBeenCalledWith(secondCanvas, 0, 0);
  expect(adapter.lastFrameTime).toBe(12);
});

test('createMediabunnyAdapter waits for active recovery before seeking the broken source', async () => {
  const initialInput = createMockInput();
  const fallbackInput = createMockInput();
  let resolveFallbackTrack = (_track: MockVideoTrack | null) => {};
  fallbackInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((resolve) => {
        resolveFallbackTrack = resolve;
      })
  );
  const decoderError = new Error('decoder failed');
  const canvasSink: MockCanvasSink = {
    getCanvas: vi
      .fn()
      .mockRejectedValueOnce(decoderError)
      .mockImplementation(async (timestamp) => ({
        canvas: document.createElement('canvas'),
        timestamp,
        duration: 1 / 30,
      })),
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
  const visual = createActiveClip('visual', 'source-1', 1);
  await waitForAdapterLoad(adapter);

  await expect(adapter.renderVideo(visual, fromSeconds(1))).rejects.toBe(decoderError);
  await vi.waitFor(() => {
    expect(fallbackInput.getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });
  const seek = adapter.seek(fromSeconds(2), createActiveLayers([visual], 2));
  await Promise.resolve();
  expect(canvasSink.getCanvas).toHaveBeenCalledOnce();

  resolveFallbackTrack(createMockVideoTrack());
  await seek;
  expect(canvasSink.getCanvas).toHaveBeenCalledTimes(2);
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'ready',
    selectedInputIndex: 1,
  });
});
