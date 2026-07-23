import { expect, test, vi } from 'vite-plus/test';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { createMediabunnyAdapter } from '#mediabunny-adapter/index';
import {
  mediabunnyTestFixtures,
  type MockCanvasSink,
  type MockAudioSink,
  type MockWrappedCanvas,
  type MockWrappedAudioBuffer,
} from '#mediabunny-adapter-test/testHelpers';

const {
  waitForAdapterLoad,
  createMockAudioTrack,
  createMockInput,
  createMockAudioContext,
  urlSource,
  createMockMediabunny,
  createActiveClip,
  createActiveLayers,
} = mediabunnyTestFixtures;

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

test('createMediabunnyAdapter stops outputs that leave the active source set', async () => {
  const firstInput = createMockInput({ audioTrack: createMockAudioTrack() });
  const secondInput = createMockInput({ audioTrack: createMockAudioTrack() });
  const audioContext = createMockAudioContext();
  const drawImage = vi.fn();
  const previewCanvas = document.createElement('canvas');
  vi.spyOn(previewCanvas, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  let resolveFirstFrame = (_result: IteratorResult<MockWrappedCanvas, void>) => {};
  const firstFrame = new Promise<IteratorResult<MockWrappedCanvas, void>>((resolve) => {
    resolveFirstFrame = resolve;
  });
  const firstVideoNext = vi
    .fn<() => Promise<IteratorResult<MockWrappedCanvas, void>>>()
    .mockReturnValueOnce(firstFrame)
    .mockResolvedValue({ done: true, value: undefined });
  let resolveFirstVideoClose = (_result: IteratorResult<MockWrappedCanvas, void>) => {};
  const firstVideoClose = new Promise<IteratorResult<MockWrappedCanvas, void>>((resolve) => {
    resolveFirstVideoClose = resolve;
  });
  const closeFirstVideoIterator = vi.fn(() => firstVideoClose);
  const firstVideoIterator: AsyncGenerator<MockWrappedCanvas, void, void> = {
    next: firstVideoNext,
    return: closeFirstVideoIterator,
    throw: vi.fn(async (iteratorError?: Error) => {
      throw iteratorError ?? new Error('Video iterator failed.');
    }),
    [Symbol.asyncIterator]() {
      return this;
    },
    [Symbol.asyncDispose]: vi.fn(async () => {}),
  };
  let videoIteratorCount = 0;
  const canvasSink: MockCanvasSink = {
    getCanvas: vi.fn(async (timestamp) => ({
      canvas: document.createElement('canvas'),
      timestamp,
      duration: 1 / 30,
    })),
    canvases: vi.fn(() => {
      videoIteratorCount += 1;
      return videoIteratorCount === 1
        ? firstVideoIterator
        : (async function* (): AsyncGenerator<MockWrappedCanvas, void, void> {})();
    }),
  };
  const audioSink: MockAudioSink = {
    buffers: vi.fn((start: number, end: number) =>
      (async function* () {
        yield {
          buffer: {} as AudioBuffer,
          timestamp: start,
          duration: end - start,
        };
      })()
    ),
  };
  const adapter = createMediabunnyAdapter({
    audio: { context: audioContext as unknown as AudioContext },
    canvas: previewCanvas,
    mediabunny: createMockMediabunny([firstInput, secondInput], { audioSink, canvasSink }).module,
    sources: [
      urlSource('source-1', 'https://media.example/one.mp4'),
      urlSource('source-2', 'https://media.example/two.mp4'),
    ],
  });
  const firstVisual = createActiveClip('visual', 'source-1', 1);
  const firstAudio = createActiveClip('audio', 'source-1', 1);
  const secondVisual = createActiveClip('visual', 'source-2', 2);
  const secondAudio = createActiveClip('audio', 'source-2', 2);

  await waitForAdapterLoad(adapter);
  await adapter.seek(fromSeconds(1), createActiveLayers([firstVisual, firstAudio], 1));
  expect(adapter.startClock(fromSeconds(1), 1)).toBe(true);
  await adapter.syncLayers({
    timelineTime: fromSeconds(1),
    reason: 'play',
    activeLayers: createActiveLayers([firstVisual, firstAudio], 1),
  });
  await vi.waitFor(() => {
    expect(firstVideoNext).toHaveBeenCalledOnce();
    expect(audioContext.createBufferSource).toHaveBeenCalledOnce();
  });
  drawImage.mockClear();
  const firstAudioNode = audioContext.createBufferSource.mock.results[0]?.value;

  const secondSynchronization = adapter.syncLayers({
    timelineTime: fromSeconds(2),
    reason: 'tick',
    activeLayers: createActiveLayers([secondVisual, secondAudio], 2),
  });
  await vi.waitFor(() => {
    expect(closeFirstVideoIterator).toHaveBeenCalledOnce();
  });
  resolveFirstFrame({
    done: false,
    value: {
      canvas: document.createElement('canvas'),
      timestamp: 1,
      duration: 1 / 30,
    },
  });
  await Promise.resolve();
  expect(drawImage).not.toHaveBeenCalled();
  resolveFirstVideoClose({ done: true, value: undefined });
  await secondSynchronization;

  expect(closeFirstVideoIterator).toHaveBeenCalledOnce();
  expect(firstAudioNode?.stop).toHaveBeenCalledOnce();
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

test('createMediabunnyAdapter stops audio on pause without opening another iterator', async () => {
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
  await adapter.syncLayers({ timelineTime: fromSeconds(1), reason: 'play', activeLayers });
  await vi.waitFor(() => {
    expect(audioContext.createBufferSource).toHaveBeenCalledOnce();
  });
  const playingNode = audioContext.createBufferSource.mock.results[0]?.value;

  adapter.stopClock();
  await adapter.syncLayers({ timelineTime: fromSeconds(1), reason: 'pause', activeLayers });
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

  expect(playingNode?.stop).toHaveBeenCalledOnce();
  expect(audioSink.buffers).toHaveBeenCalledOnce();
  expect(adapter.sourceStateById.get('audio-source')).toMatchObject({
    status: 'ready',
    error: null,
  });
  expect(adapter.error).toBeNull();
});

test('createMediabunnyAdapter keeps paused rate synchronization out of streaming paths', async () => {
  const input = createMockInput({ audioTrack: createMockAudioTrack() });
  const audioContext = createMockAudioContext();
  const canvasSink: MockCanvasSink = {
    getCanvas: vi.fn(async (timestamp) => ({
      canvas: document.createElement('canvas'),
      timestamp,
      duration: 1 / 30,
    })),
    canvases: vi.fn(async function* () {}),
  };
  const audioSink: MockAudioSink = {
    buffers: vi.fn(async function* () {}),
  };
  const adapter = createMediabunnyAdapter({
    audio: { context: audioContext as unknown as AudioContext },
    canvas: document.createElement('canvas'),
    mediabunny: createMockMediabunny([input], { audioSink, canvasSink }).module,
    sources: [urlSource('source-1', 'https://media.example/video.mp4')],
  });
  const visualClip = createActiveClip('visual', 'source-1', 1);
  const audioClip = createActiveClip('audio', 'source-1', 1);
  const activeLayers = createActiveLayers([visualClip, audioClip], 1);

  await adapter.seek(fromSeconds(1), activeLayers);
  adapter.setClockRate(2);
  await adapter.syncLayers({ timelineTime: fromSeconds(1), reason: 'rate', activeLayers });

  expect(canvasSink.canvases).not.toHaveBeenCalled();
  expect(audioSink.buffers).not.toHaveBeenCalled();
  expect(audioContext.createBufferSource).not.toHaveBeenCalled();
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
