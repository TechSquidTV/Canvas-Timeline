import { afterEach, beforeEach, vi } from 'vite-plus/test';
import type { ActiveClip, ActiveLayerResult, Clip, Track } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import * as RealMediabunny from 'mediabunny';
import type {
  createMediabunnyAdapter,
  MediabunnyModule,
  MediabunnySource,
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

export type MockVideoTrack = {
  getCodec: ReturnType<typeof vi.fn<() => Promise<string | null>>>;
  canDecode: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  canBeTransparent: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  getDisplayWidth: ReturnType<typeof vi.fn<() => Promise<number>>>;
  getDisplayHeight: ReturnType<typeof vi.fn<() => Promise<number>>>;
  getRotation: ReturnType<typeof vi.fn<() => Promise<0>>>;
  computePacketStats: ReturnType<typeof vi.fn<() => Promise<{ averagePacketRate: number }>>>;
};

export type MockAudioTrack = {
  getCodec: ReturnType<typeof vi.fn<() => Promise<string | null>>>;
  canDecode: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  getSampleRate: ReturnType<typeof vi.fn<() => Promise<number>>>;
};

export type MockInput = {
  getPrimaryVideoTrack: ReturnType<typeof vi.fn<() => Promise<MockVideoTrack | null>>>;
  getPrimaryAudioTrack: ReturnType<typeof vi.fn<() => Promise<MockAudioTrack | null>>>;
  getVideoTracks: ReturnType<typeof vi.fn<() => Promise<MockVideoTrack[]>>>;
  getAudioTracks: ReturnType<typeof vi.fn<() => Promise<MockAudioTrack[]>>>;
  getFirstTimestamp: ReturnType<typeof vi.fn<() => Promise<number>>>;
  getDurationFromMetadata: ReturnType<typeof vi.fn<() => Promise<number | null>>>;
  computeDuration: ReturnType<typeof vi.fn<() => Promise<number>>>;
  dispose: ReturnType<typeof vi.fn<() => void>>;
};

export type MockCanvasSink = {
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

export type MockAudioSink = {
  buffers: ReturnType<
    typeof vi.fn<(start: number, end: number) => AsyncGenerator<MockWrappedAudioBuffer, void>>
  >;
};

export interface MockWrappedCanvas {
  canvas: HTMLCanvasElement;
  timestamp: number;
  duration: number;
}

export interface MockWrappedAudioBuffer {
  buffer: AudioBuffer;
  timestamp: number;
  duration: number;
}

export interface MockAudioContext {
  currentTime: number;
  destination: AudioNode;
  sampleRate: number;
  state: AudioContextState;
  createGain: ReturnType<typeof vi.fn<() => GainNode>>;
  createBufferSource: ReturnType<typeof vi.fn<() => AudioBufferSourceNode>>;
  close: ReturnType<typeof vi.fn<() => Promise<void>>>;
  resume: ReturnType<typeof vi.fn<() => Promise<void>>>;
}

export interface MockMediabunny {
  audioSink: MockAudioSink;
  canvasSink: MockCanvasSink;
  constructAudioSink: ReturnType<typeof vi.fn<() => void>>;
  constructCanvasSink: ReturnType<typeof vi.fn<() => void>>;
  constructInput: ReturnType<typeof vi.fn<() => void>>;
  createdBlobSources: Blob[];
  createdUrlSources: (string | URL | Request)[];
  module: MediabunnyModule;
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
): MockMediabunny {
  const createdUrlSources: (string | URL | Request)[] = [];
  const createdBlobSources: Blob[] = [];
  const { audioSink, canvasSink } = createSinkFactory(sinkOptions);
  const constructCanvasSink = vi.fn();
  const constructAudioSink = vi.fn();
  const constructInput = vi.fn();
  let inputIndex = 0;

  class MockInputConstructor {
    constructor() {
      constructInput();
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
      constructCanvasSink();
      return canvasSink;
    }
  }

  class MockAudioBufferSinkConstructor {
    constructor() {
      constructAudioSink();
      return audioSink;
    }
  }

  return {
    audioSink,
    canvasSink,
    constructAudioSink,
    constructCanvasSink,
    constructInput,
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

export const mediabunnyTestFixtures = {
  createActiveClip,
  createActiveLayerResult,
  createActiveLayers,
  createClip,
  createMockAudioContext,
  createMockAudioTrack,
  createMockInput,
  createMockMediabunny,
  createMockVideoTrack,
  createSinkFactory,
  createTrack,
  urlSource,
  waitForAdapterLoad,
};
