import type {
  ActiveClip,
  ActiveLayerResult,
  Clip,
  MaybePromise,
} from '@techsquidtv/canvas-timeline-core';
import type {
  TimelineMediaSyncAdapter,
  TimelineContentPlaybackStatus,
  TimelineMediaSyncReason,
  TimelineLayerSyncDetails,
} from '@techsquidtv/canvas-timeline-react';
import { toSeconds, type RationalTime } from '@techsquidtv/canvas-timeline-utils';
import type * as Mediabunny from 'mediabunny';

/**
 * Runtime shape of the Mediabunny module used by the timeline adapter.
 */
export type MediabunnyModule = typeof Mediabunny;

/**
 * Media asset descriptor that tells the adapter how to open a timeline source.
 */
export type MediabunnySource =
  | { id: string; url: string }
  | { id: string; blob: Blob | File }
  | { id: string; input: Mediabunny.Input }
  | { id: string; createInput: (mediabunny: MediabunnyModule) => MaybePromise<Mediabunny.Input> };

/**
 * Web Audio options used when Mediabunny drives timeline audio playback.
 */
export interface MediabunnyTimelineAudioOptions {
  /** Audio context used to decode and schedule source audio. */
  context?: AudioContext;
  /** Audio node that receives scheduled source playback. */
  destination?: AudioNode;
  /** Gain applied to scheduled audio, from 0 to 1. */
  volume?: number;
}

/**
 * Options for creating a Mediabunny-backed timeline media sync adapter.
 */
export interface CreateMediabunnyAdapterOptions {
  /** Media sources keyed by the `sourceId` values used by timeline clips. */
  sources: readonly MediabunnySource[];
  /** Canvas that receives decoded video frames. */
  canvas?: HTMLCanvasElement | null;
  /** Mediabunny module instance or lazy browser loader. */
  mediabunny: MediabunnyModule | (() => Promise<MediabunnyModule>);
  /** Audio scheduling options for source playback. */
  audio?: MediabunnyTimelineAudioOptions;
  /** Track kinds the adapter should treat as visual frame sources. Defaults to `["visual"]`. */
  visualTrackKinds?: readonly string[];
  /** Track kinds the adapter should treat as audio scheduling sources. Defaults to `["audio"]`. */
  audioTrackKinds?: readonly string[];
  /** Callback fired when adapter status, readiness, or frame state changes. */
  onChange?: () => void;
}

/**
 * Decoded video frame returned from a Mediabunny canvas sink.
 */
export interface MediabunnyFrame {
  /** Canvas containing the decoded frame pixels. */
  canvas: HTMLCanvasElement | OffscreenCanvas;
  /** Source-media timestamp for the decoded frame, in seconds. */
  timestamp: number;
}

/**
 * Adapter that connects Canvas Timeline playback and frame rendering to Mediabunny.
 */
export interface MediabunnyAdapter {
  /** Whether at least one source is loaded and ready for playback. */
  readonly ready: boolean;
  /** Human-readable loading, playback, or error status. */
  readonly status: string;
  /** Last source loading error, when one is active. */
  readonly error: Error | null;
  /** Timestamp of the last rendered video frame, in seconds. */
  readonly lastFrameTime: number | null;
  /** Loaded media duration by source id, in seconds. */
  readonly durationBySourceId: ReadonlyMap<string, number>;
  /** React timeline media sync adapter backed by Mediabunny clocks and sinks. */
  readonly syncAdapter: TimelineMediaSyncAdapter<string>;
  /** Update the canvas used for video preview rendering. */
  setCanvas: (canvas: HTMLCanvasElement | null) => void;
  /** Read the current timeline playback time from the active Mediabunny clock. */
  getClockTime: () => number;
  /** Start Mediabunny-driven playback at a timeline time and rate. */
  startClock: (timelineTime: RationalTime, playbackRate: number) => boolean;
  /** Stop Mediabunny-driven playback without disposing loaded sources. */
  stopClock: () => void;
  /** Resume a suspended audio context and keep the current clock aligned. */
  resumeClock: (playbackRate: number) => Promise<void>;
  /** Update the active playback rate while preserving timeline position. */
  setClockRate: (playbackRate: number) => void;
  /** Seek decoded media to the active clips for a timeline time. */
  seek: (timelineTime: RationalTime, activeLayers: ActiveLayerResult<string>) => Promise<void>;
  /** Render the active video clip at its source-mapped timeline time. */
  renderVideo: (activeVideo: ActiveClip, timelineTime: RationalTime) => Promise<void>;
  /** Synchronize audio scheduling for the active timeline audio clip. */
  syncAudio: (
    activeAudio: ActiveClip | undefined,
    timelineTime: RationalTime,
    reason: TimelineMediaSyncReason
  ) => void;
  /** Synchronize Mediabunny sinks from active timeline layers. */
  syncLayers: (details: TimelineLayerSyncDetails<string>) => Promise<void>;
  /** Clear the preview canvas and reset last-frame state. */
  clearVideo: () => void;
  /** Decode and return a frame for an active video clip without painting it. */
  getFrame: (activeVideo: ActiveClip) => Promise<MediabunnyFrame | null>;
  /** Release Mediabunny inputs, sinks, audio nodes, and loaded source state. */
  dispose: () => void;
}

interface MediabunnySourceController {
  sourceId: string;
  input: Mediabunny.Input | null;
  ownsInput: boolean;
  videoSink: Mediabunny.CanvasSink | null;
  audioSink: Mediabunny.AudioBufferSink | null;
  audioContext: AudioContext | null;
  gainNode: GainNode | null;
  audioBufferIterator: AsyncGenerator<Mediabunny.WrappedAudioBuffer, void, unknown> | null;
  queuedAudioNodes: Set<AudioBufferSourceNode>;
  timelineTimeAtStart: number;
  audioContextStartTime: number | null;
  audioClockReady: boolean;
  wallClockStartTime: number | null;
  playbackRate: number;
  playing: boolean;
  activeAudioSyncKey: string | undefined;
  asyncId: number;
  renderingFrame: boolean;
  pendingFrameRequest: PendingFrameRequest | undefined;
}

interface PendingFrameRequest {
  canvas: HTMLCanvasElement;
  sourceSeconds: number;
  onFrame?: (timestamp: number) => void;
}

interface LoadedMediaInfo {
  duration: number;
}

/**
 * Format a timeline or source-media time value for Mediabunny adapter status text.
 *
 * @param seconds - Timeline or source-media time in decimal seconds.
 */
export function formatMediabunnyTime(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return '0.00s';
  }

  return `${seconds.toFixed(2)}s`;
}

/**
 * Create a Mediabunny adapter that drives Canvas Timeline media playback.
 *
 * @param options - Mediabunny sources, preview canvas, audio, loader, and change callback.
 */
export function createMediabunnyAdapter(
  options: CreateMediabunnyAdapterOptions
): MediabunnyAdapter {
  let ready = false;
  let status = 'Loading Mediabunny sources...';
  let error: Error | null = null;
  let canvas = options.canvas ?? null;
  let disposed = false;
  let clockController: MediabunnySourceController | null = null;
  let currentPlaybackRate = 1;
  let lastFrameTime: number | null = null;
  const controllers = new Map<string, MediabunnySourceController>();
  const durationBySourceId = new Map<string, number>();
  const visualTrackKinds = new Set(options.visualTrackKinds ?? ['visual']);
  const audioTrackKinds = new Set(options.audioTrackKinds ?? ['audio']);

  const notify = () => {
    options.onChange?.();
  };

  const setStatus = (nextStatus: string) => {
    status = nextStatus;
    notify();
  };

  const setError = (nextError: unknown) => {
    error = nextError instanceof Error ? nextError : new Error(String(nextError));
    status = error.message;
    notify();
  };

  const getController = (activeClip: ActiveClip | undefined) => {
    if (activeClip === undefined) {
      return undefined;
    }

    return controllers.get(activeClip.clip.sourceId);
  };

  const setAllClocks = (timelineSeconds: number, playbackRate: number, playing: boolean) => {
    for (const controller of controllers.values()) {
      setTimelineClock(controller, timelineSeconds, playbackRate);
      controller.playing = playing;
    }
  };

  const clearVideo = () => {
    if (canvas === null) {
      return;
    }

    const controller = clockController ?? [...controllers.values()][0];
    if (controller !== undefined) {
      clearPreviewCanvas(controller, canvas);
    }
    lastFrameTime = null;
    notify();
  };

  const renderVideo = async (activeVideo: ActiveClip, _timelineTime: RationalTime) => {
    const controller = getController(activeVideo);
    if (controller === undefined || canvas === null) {
      return;
    }

    clockController = controller;
    await renderActiveVideoFrame(controller, canvas, activeVideo, (timestamp) => {
      lastFrameTime = timestamp;
      notify();
    });
  };

  const syncAudio = (activeAudio: ActiveClip | undefined) => {
    const controller = getController(activeAudio);
    if (controller === undefined) {
      for (const sourceController of controllers.values()) {
        syncAudioClip(sourceController, undefined);
      }
      return;
    }

    clockController = controller;
    syncAudioClip(controller, activeAudio);
  };

  const findActiveClipForKinds = (
    activeLayers: ActiveLayerResult<string>,
    trackKinds: ReadonlySet<string>
  ) => activeLayers.all.find((activeClip) => trackKinds.has(activeClip.track.kind));

  const shouldSyncAudio = (
    reason: TimelineMediaSyncReason,
    activeAudio: ActiveClip | undefined
  ) => {
    if (reason !== 'tick') {
      return true;
    }

    if (activeAudio === undefined) {
      return [...controllers.values()].some(
        (controller) => controller.activeAudioSyncKey !== undefined
      );
    }

    const controller = getController(activeAudio);
    return controller?.activeAudioSyncKey !== activeAudio.syncKey;
  };

  const syncLayers = async ({
    activeLayers,
    reason,
    timelineTime,
  }: TimelineLayerSyncDetails<string>) => {
    const activeVisual = findActiveClipForKinds(activeLayers, visualTrackKinds);
    const activeAudio = findActiveClipForKinds(activeLayers, audioTrackKinds);

    if (activeVisual !== undefined) {
      await renderVideo(activeVisual, timelineTime);
    } else {
      clearVideo();
    }

    if (shouldSyncAudio(reason, activeAudio)) {
      syncAudio(activeAudio);
    }
  };

  const adapter: MediabunnyAdapter = {
    get ready() {
      return ready;
    },
    get status() {
      return status;
    },
    get error() {
      return error;
    },
    get lastFrameTime() {
      return lastFrameTime;
    },
    get durationBySourceId() {
      return durationBySourceId;
    },
    get syncAdapter() {
      return {
        getClockTime: adapter.getClockTime,
        startClock: adapter.startClock,
        stopClock: adapter.stopClock,
        resumeClock: adapter.resumeClock,
        setClockRate: adapter.setClockRate,
        seek: adapter.seek,
        syncLayers: adapter.syncLayers,
        onStatus: (playbackStatus: TimelineContentPlaybackStatus) => {
          if (playbackStatus === 'playing') {
            setStatus('Mediabunny is driving timeline media playback.');
          } else if (playbackStatus === 'content-gap') {
            setStatus('Reached the next content gap.');
          } else if (playbackStatus === 'paused') {
            setStatus('Paused. Timeline edits seek Mediabunny frames.');
          }
        },
      };
    },
    setCanvas: (nextCanvas) => {
      canvas = nextCanvas;
    },
    getClockTime: () => {
      const controller = clockController ?? [...controllers.values()][0];
      return controller === undefined ? 0 : getTimelinePlaybackSeconds(controller);
    },
    startClock: (timelineTime, playbackRate) => {
      if (!ready || controllers.size === 0) {
        return false;
      }

      currentPlaybackRate = playbackRate;
      setAllClocks(toSeconds(timelineTime), playbackRate, true);
      return true;
    },
    stopClock: () => {
      for (const controller of controllers.values()) {
        controller.playing = false;
      }
    },
    resumeClock: async (playbackRate) => {
      const controller = clockController ?? [...controllers.values()][0];
      if (controller?.audioContext?.state !== 'suspended') {
        return;
      }

      await controller.audioContext.resume();
      if (controller.playing) {
        setTimelineClock(controller, getTimelinePlaybackSeconds(controller), playbackRate);
      }
    },
    setClockRate: (playbackRate) => {
      const timelineSeconds = adapter.getClockTime();
      const playing = [...controllers.values()].some((controller) => controller.playing);
      currentPlaybackRate = playbackRate;
      setAllClocks(timelineSeconds, playbackRate, playing);
    },
    seek: async (timelineTime, activeLayers) => {
      if (!ready) {
        return;
      }

      const activeVisual = findActiveClipForKinds(activeLayers, visualTrackKinds);
      const activeAudio = findActiveClipForKinds(activeLayers, audioTrackKinds);

      setAllClocks(toSeconds(timelineTime), currentPlaybackRate, false);
      if (activeVisual !== undefined) {
        await adapter.renderVideo(activeVisual, timelineTime);
      } else {
        adapter.clearVideo();
      }

      if (activeVisual === undefined) {
        setStatus(
          activeAudio ? 'Audio-only region at playhead.' : 'No active content at playhead.'
        );
      } else {
        setStatus(
          activeAudio
            ? 'Ready. Visuals and audio are mapped from separate timeline clips.'
            : 'Ready. Visual content is active; audio starts at its own clip offset.'
        );
      }
    },
    renderVideo,
    syncAudio,
    syncLayers,
    clearVideo,
    getFrame: async (activeVideo) => {
      const controller = getController(activeVideo);
      if (controller === undefined || controller.videoSink === null) {
        return null;
      }

      const wrappedCanvas = await controller.videoSink.getCanvas(toSeconds(activeVideo.sourceTime));
      if (wrappedCanvas === null) {
        return null;
      }

      return {
        canvas: wrappedCanvas.canvas,
        timestamp: wrappedCanvas.timestamp,
      };
    },
    dispose: () => {
      disposed = true;
      for (const controller of controllers.values()) {
        disposeController(controller);
      }
      controllers.clear();
      durationBySourceId.clear();
    },
  };

  void loadSources(options, controllers, durationBySourceId)
    .then((loadedCount) => {
      if (disposed) {
        controllers.clear();
        durationBySourceId.clear();
        return;
      }

      ready = loadedCount > 0;
      status =
        loadedCount > 0
          ? 'Ready. Mediabunny can drive timeline video and audio.'
          : 'No Mediabunny source could be loaded.';
      notify();
    })
    .catch((loadError: unknown) => {
      if (!disposed) {
        setError(loadError);
      }
    });

  return adapter;
}

async function loadSources(
  options: CreateMediabunnyAdapterOptions,
  controllers: Map<string, MediabunnySourceController>,
  durationBySourceId: Map<string, number>
) {
  const mediabunny =
    typeof options.mediabunny === 'function' ? await options.mediabunny() : options.mediabunny;

  let loadedCount = 0;
  let lastError: unknown;

  for (const source of options.sources) {
    if (controllers.has(source.id)) {
      continue;
    }

    const controller = createController(source.id);
    try {
      const mediaInfo = await loadMediabunnySourceController(
        controller,
        mediabunny,
        source,
        options.audio
      );
      controllers.set(source.id, controller);
      durationBySourceId.set(source.id, mediaInfo.duration);
      loadedCount += 1;
    } catch (sourceError) {
      lastError = sourceError;
      disposeController(controller);
    }
  }

  if (loadedCount === 0 && lastError !== undefined) {
    throw lastError;
  }

  return loadedCount;
}

function createController(sourceId: string): MediabunnySourceController {
  return {
    sourceId,
    input: null,
    ownsInput: true,
    videoSink: null,
    audioSink: null,
    audioContext: null,
    gainNode: null,
    audioBufferIterator: null,
    queuedAudioNodes: new Set(),
    timelineTimeAtStart: 0,
    audioContextStartTime: null,
    audioClockReady: false,
    wallClockStartTime: null,
    playbackRate: 1,
    playing: false,
    activeAudioSyncKey: undefined,
    asyncId: 0,
    renderingFrame: false,
    pendingFrameRequest: undefined,
  };
}

async function loadMediabunnySourceController(
  controller: MediabunnySourceController,
  mediabunny: MediabunnyModule,
  source: MediabunnySource,
  audioOptions: MediabunnyTimelineAudioOptions | undefined
): Promise<LoadedMediaInfo> {
  const input = await createInput(mediabunny, source);
  controller.input = input;
  controller.ownsInput = !('input' in source);

  const videoTrack = await input.getPrimaryVideoTrack();
  const audioTrack = await input.getPrimaryAudioTrack();
  type InputTrack = NonNullable<typeof videoTrack> | NonNullable<typeof audioTrack>;
  const tracks = [videoTrack, audioTrack].filter((track): track is InputTrack => track !== null);

  if (tracks.length === 0) {
    throw new Error(`No audio or video track found for source "${source.id}".`);
  }

  const firstTimestamp = Math.max(await input.getFirstTimestamp(tracks), 0);
  const endTimestamp =
    (await input.getDurationFromMetadata(tracks, { skipLiveWait: true })) ??
    (await input.computeDuration(tracks, { skipLiveWait: true }));

  if (videoTrack !== null) {
    if ((await videoTrack.getCodec()) === null || !(await videoTrack.canDecode())) {
      throw new Error(`The browser cannot decode the video track for source "${source.id}".`);
    }

    const alpha = await videoTrack.canBeTransparent();
    controller.videoSink = new mediabunny.CanvasSink(videoTrack, {
      poolSize: 2,
      fit: 'contain',
      alpha,
    });
  }

  const AudioContextCtor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (AudioContextCtor === undefined) {
    throw new Error('This browser does not expose AudioContext.');
  }

  const audioContext =
    audioOptions?.context ??
    (audioTrack !== null
      ? new AudioContextCtor({ sampleRate: await audioTrack.getSampleRate() })
      : new AudioContextCtor());
  const gainNode = audioContext.createGain();
  gainNode.gain.value = audioOptions?.volume ?? 0.7;
  gainNode.connect(audioOptions?.destination ?? audioContext.destination);
  controller.audioContext = audioContext;
  controller.gainNode = gainNode;

  if (
    audioTrack !== null &&
    (await audioTrack.getCodec()) !== null &&
    (await audioTrack.canDecode())
  ) {
    controller.audioSink = new mediabunny.AudioBufferSink(audioTrack);
  }

  return {
    duration: endTimestamp - firstTimestamp,
  };
}

async function createInput(
  mediabunny: MediabunnyModule,
  source: MediabunnySource
): Promise<Mediabunny.Input> {
  if ('input' in source) {
    return source.input;
  }

  if ('createInput' in source) {
    return source.createInput(mediabunny);
  }

  if ('url' in source) {
    return new mediabunny.Input({
      source: new mediabunny.UrlSource(source.url),
      formats: mediabunny.ALL_FORMATS,
    });
  }

  const mediabunnyWithBlobSource = mediabunny as MediabunnyModule & {
    BlobSource?: new (
      blob: Blob | File
    ) => ConstructorParameters<MediabunnyModule['Input']>[0]['source'];
  };

  if (mediabunnyWithBlobSource.BlobSource === undefined) {
    throw new Error('This Mediabunny version does not expose BlobSource for local files.');
  }

  return new mediabunny.Input({
    source: new mediabunnyWithBlobSource.BlobSource(source.blob),
    formats: mediabunny.ALL_FORMATS,
  });
}

function setTimelineClock(
  controller: MediabunnySourceController,
  timelineSeconds: number,
  playbackRate: number
) {
  controller.timelineTimeAtStart = timelineSeconds;
  controller.audioContextStartTime = controller.audioContext?.currentTime ?? null;
  controller.audioClockReady = controller.audioContext?.state === 'running';
  controller.wallClockStartTime = performance.now() / 1000;
  controller.playbackRate = playbackRate;
}

function getTimelinePlaybackSeconds(controller: MediabunnySourceController) {
  if (
    controller.playing &&
    controller.audioContext !== null &&
    controller.audioContextStartTime !== null &&
    controller.audioClockReady &&
    controller.audioContext.state === 'running'
  ) {
    return (
      controller.timelineTimeAtStart +
      (controller.audioContext.currentTime - controller.audioContextStartTime) *
        controller.playbackRate
    );
  }

  if (controller.playing && controller.wallClockStartTime !== null) {
    return (
      controller.timelineTimeAtStart +
      (performance.now() / 1000 - controller.wallClockStartTime) * controller.playbackRate
    );
  }

  return controller.timelineTimeAtStart;
}

async function renderActiveVideoFrame(
  controller: MediabunnySourceController,
  canvas: HTMLCanvasElement,
  video: ActiveClip,
  onFrame?: (timestamp: number) => void
) {
  await renderFrameAt(controller, canvas, toSeconds(video.sourceTime), onFrame);
}

function clearPreviewCanvas(controller: MediabunnySourceController, canvas: HTMLCanvasElement) {
  controller.asyncId += 1;
  controller.pendingFrameRequest = undefined;

  const context = canvas.getContext('2d');
  if (context !== null) {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function syncAudioClip(controller: MediabunnySourceController, audio: ActiveClip | undefined) {
  stopAudioIterator(controller);
  stopQueuedAudio(controller);
  controller.activeAudioSyncKey = audio?.syncKey;

  if (audio === undefined || controller.audioSink === null) {
    return;
  }

  const sourceStart = toSeconds(audio.sourceTime);
  const sourceEnd = toSeconds(audio.sourceRange.end);

  if (sourceEnd <= sourceStart) {
    return;
  }

  controller.audioBufferIterator = controller.audioSink.buffers(sourceStart, sourceEnd);
  void runAudioIterator(controller, audio.clip, audio.syncKey);
}

function stopMediaClock(controller: MediabunnySourceController) {
  const currentTime = getTimelinePlaybackSeconds(controller);
  controller.timelineTimeAtStart = currentTime;
  controller.playing = false;
  controller.audioContextStartTime = null;
  controller.audioClockReady = false;
  controller.wallClockStartTime = null;
  controller.activeAudioSyncKey = undefined;

  stopAudioIterator(controller);
  stopQueuedAudio(controller);
}

function disposeController(controller: MediabunnySourceController) {
  stopMediaClock(controller);
  if (controller.ownsInput) {
    controller.input?.dispose();
  }
  void controller.audioContext?.close();
}

function stopQueuedAudio(controller: MediabunnySourceController) {
  for (const node of controller.queuedAudioNodes) {
    try {
      node.stop();
    } catch {
      // The node may already have ended.
    }
  }
  controller.queuedAudioNodes.clear();
}

function stopAudioIterator(controller: MediabunnySourceController) {
  void controller.audioBufferIterator?.return();
  controller.audioBufferIterator = null;
}

async function runAudioIterator(
  controller: MediabunnySourceController,
  audioClip: Clip,
  audioSyncKey: string
) {
  if (
    controller.audioBufferIterator === null ||
    controller.audioContext === null ||
    controller.gainNode === null
  ) {
    return;
  }

  const clipTimelineStart = toSeconds(audioClip.timelineStart);
  const clipSourceStart = toSeconds(audioClip.sourceStart);

  for await (const { buffer, timestamp } of controller.audioBufferIterator) {
    if (
      !controller.playing ||
      controller.audioContext === null ||
      controller.gainNode === null ||
      controller.audioContextStartTime === null ||
      controller.activeAudioSyncKey !== audioSyncKey
    ) {
      break;
    }

    const node = controller.audioContext.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = controller.playbackRate;
    node.connect(controller.gainNode);

    const timelineTimestamp = clipTimelineStart + (timestamp - clipSourceStart);
    let startTimestamp =
      controller.audioContextStartTime +
      (timelineTimestamp - controller.timelineTimeAtStart) / controller.playbackRate;
    startTimestamp =
      Math.round(controller.audioContext.sampleRate * startTimestamp) /
      controller.audioContext.sampleRate;

    if (startTimestamp >= controller.audioContext.currentTime) {
      node.start(startTimestamp);
    } else {
      const offset =
        (controller.audioContext.currentTime - startTimestamp) * controller.playbackRate;
      node.start(controller.audioContext.currentTime, offset);
    }

    controller.queuedAudioNodes.add(node);
    node.onended = () => {
      controller.queuedAudioNodes.delete(node);
    };

    if (timelineTimestamp - getTimelinePlaybackSeconds(controller) >= 1) {
      await new Promise<void>((resolve) => {
        const interval = window.setInterval(() => {
          if (
            !controller.playing ||
            timelineTimestamp - getTimelinePlaybackSeconds(controller) < 1
          ) {
            window.clearInterval(interval);
            resolve();
          }
        }, 100);
      });
    }
  }
}

async function renderFrameAt(
  controller: MediabunnySourceController,
  canvas: HTMLCanvasElement,
  sourceSeconds: number,
  onFrame?: (timestamp: number) => void
) {
  if (controller.videoSink === null) {
    return;
  }

  if (controller.renderingFrame) {
    controller.pendingFrameRequest = { canvas, sourceSeconds, onFrame };
    return;
  }

  controller.renderingFrame = true;

  try {
    let request: PendingFrameRequest | undefined = { canvas, sourceSeconds, onFrame };

    while (request !== undefined) {
      controller.pendingFrameRequest = undefined;
      const renderId = ++controller.asyncId;
      const wrappedCanvas = await controller.videoSink.getCanvas(request.sourceSeconds);
      if (renderId !== controller.asyncId || wrappedCanvas === null) {
        request = controller.pendingFrameRequest;
        continue;
      }

      const context = request.canvas.getContext('2d');
      if (context === null) {
        request = controller.pendingFrameRequest;
        continue;
      }

      if (
        request.canvas.width !== wrappedCanvas.canvas.width ||
        request.canvas.height !== wrappedCanvas.canvas.height
      ) {
        request.canvas.width = wrappedCanvas.canvas.width;
        request.canvas.height = wrappedCanvas.canvas.height;
      }

      context.clearRect(0, 0, request.canvas.width, request.canvas.height);
      context.drawImage(wrappedCanvas.canvas, 0, 0);
      request.onFrame?.(wrappedCanvas.timestamp);
      request = controller.pendingFrameRequest;
    }
  } finally {
    controller.renderingFrame = false;
  }
}
