import type {
  TimelineMediaSourceOperationResult,
  TimelineMediaSourceTiming,
} from '@techsquidtv/canvas-timeline-core';
import type * as Mediabunny from 'mediabunny';
import type {
  CreateMediabunnyAdapterOptions,
  MediabunnyModule,
  MediabunnySource,
  MediabunnySourceInput,
  MediabunnySourceMetadata,
  MediabunnySourceState,
} from '#mediabunny-adapter/types';
import {
  type MediabunnySourceController,
  toLogicalSourceSeconds,
} from '#mediabunny-adapter/internal/sourceController';

interface LoadedMediaInfo {
  metadata: MediabunnySourceMetadata;
}

export function validateSources(sources: readonly MediabunnySource[]) {
  const sourceIds = new Set<string>();
  for (const source of sources) {
    if (source.sourceId.length === 0) {
      throw new Error('Mediabunny sourceId cannot be empty.');
    }
    if (sourceIds.has(source.sourceId)) {
      throw new Error(`Duplicate Mediabunny sourceId "${source.sourceId}".`);
    }
    sourceIds.add(source.sourceId);
    validateMediabunnyTiming(source.sourceId, source.timing);
  }
}

export function assertValidMediabunnyVolume(volume: number) {
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
    throw new RangeError('volume must be a finite number from 0 to 1.');
  }
}

function validateMediabunnyTiming(sourceId: string, timing: TimelineMediaSourceTiming | undefined) {
  if (
    timing !== undefined &&
    (!Number.isFinite(timing.sourceTimeSeconds) || !Number.isFinite(timing.mediaTimeSeconds))
  ) {
    throw new Error(`Source "${sourceId}" timing values must be finite.`);
  }
}

export function createIdleSourceState(sourceId: string): MediabunnySourceState {
  return {
    sourceId,
    status: 'idle',
    selectedInputIndex: null,
    attempts: [],
    metadata: null,
    error: null,
  };
}

class SupersededSourceLoadError extends Error {
  override readonly name = 'SupersededSourceLoadError';

  constructor(sourceId: string) {
    super(`Loading source "${sourceId}" was superseded.`);
  }
}

export function createSupersededSourceLoadResult(
  sourceId: string
): TimelineMediaSourceOperationResult {
  return {
    ok: false,
    sourceId,
    reason: 'load-failed',
    error: new SupersededSourceLoadError(sourceId),
  };
}

export function isSupersededSourceLoadResult(
  result: TimelineMediaSourceOperationResult
): result is Extract<TimelineMediaSourceOperationResult, { ok: false }> {
  return !result.ok && result.error instanceof SupersededSourceLoadError;
}

export function areMediabunnySourcesEqual(left: MediabunnySource, right: MediabunnySource) {
  const leftFallbacks = left.fallbacks ?? [];
  const rightFallbacks = right.fallbacks ?? [];
  return (
    left.sourceId === right.sourceId &&
    areMediabunnySourceInputsEqual(left.input, right.input) &&
    leftFallbacks.length === rightFallbacks.length &&
    leftFallbacks.every((input, index) => {
      const rightInput = rightFallbacks[index];
      return rightInput !== undefined && areMediabunnySourceInputsEqual(input, rightInput);
    }) &&
    left.timing?.sourceTimeSeconds === right.timing?.sourceTimeSeconds &&
    left.timing?.mediaTimeSeconds === right.timing?.mediaTimeSeconds
  );
}

function areMediabunnySourceInputsEqual(
  left: MediabunnySourceInput,
  right: MediabunnySourceInput
): boolean {
  if (left === right) {
    return true;
  }
  if (left instanceof URL && right instanceof URL) {
    return left.href === right.href;
  }
  if (
    typeof left !== 'object' ||
    left === null ||
    typeof right !== 'object' ||
    right === null ||
    !('kind' in left) ||
    !('kind' in right) ||
    left.kind !== right.kind
  ) {
    return false;
  }
  if (left.kind === 'url' && right.kind === 'url') {
    const leftFormats = left.formats ?? [];
    const rightFormats = right.formats ?? [];
    return (
      areMediabunnyUrlsEqual(left.url, right.url) &&
      leftFormats.length === rightFormats.length &&
      leftFormats.every((format, index) => format === rightFormats[index]) &&
      left.urlSourceOptions === right.urlSourceOptions
    );
  }
  if (left.kind === 'input' && right.kind === 'input') {
    return left.input === right.input;
  }
  return (
    left.kind === 'input-factory' &&
    right.kind === 'input-factory' &&
    left.createInput === right.createInput
  );
}

function areMediabunnyUrlsEqual(left: string | URL | Request, right: string | URL | Request) {
  if (left === right) {
    return true;
  }
  if (typeof left === 'string' && typeof right === 'string') {
    return left === right;
  }
  if (left instanceof URL && right instanceof URL) {
    return left.href === right.href;
  }
  return false;
}

export async function loadMediabunnySourceController(
  controller: MediabunnySourceController,
  mediabunny: MediabunnyModule,
  source: MediabunnySource,
  sourceInput: MediabunnySourceInput,
  selectTracks: CreateMediabunnyAdapterOptions['selectTracks'],
  ensureAudioRuntime: (notifyChange?: boolean) => {
    context: AudioContext;
    gainNode: GainNode;
  } | null,
  isCurrentLoad: () => boolean,
  deferAudioRuntime: boolean
): Promise<LoadedMediaInfo> {
  const assertCurrentLoad = () => {
    if (!isCurrentLoad()) {
      throw new SupersededSourceLoadError(source.sourceId);
    }
  };
  const input = await createInput(mediabunny, sourceInput);
  controller.input = input;
  controller.ownsInput = !isSuppliedMediabunnyInput(sourceInput);
  assertCurrentLoad();

  let videoTrack: Mediabunny.InputVideoTrack | null;
  let audioTrack: Mediabunny.InputAudioTrack | null;
  if (selectTracks === undefined) {
    [videoTrack, audioTrack] = await Promise.all([
      input.getPrimaryVideoTrack(),
      input.getPrimaryAudioTrack(),
    ]);
  } else {
    const [videoTracks, audioTracks] = await Promise.all([
      input.getVideoTracks(),
      input.getAudioTracks(),
    ]);
    ({ videoTrack, audioTrack } = await selectTracks({
      source,
      sourceInput,
      input,
      videoTracks,
      audioTracks,
    }));
  }
  assertCurrentLoad();
  type InputTrack = NonNullable<typeof videoTrack> | NonNullable<typeof audioTrack>;
  const tracks = [videoTrack, audioTrack].filter((track): track is InputTrack => track !== null);

  if (tracks.length === 0) {
    throw new Error(`No audio or video track found for source "${source.sourceId}".`);
  }

  const firstTimestamp = await input.getFirstTimestamp(tracks);
  assertCurrentLoad();
  const presentationStartTimestamp = Math.max(firstTimestamp, 0);
  const metadataEndTimestamp = await input.getDurationFromMetadata(tracks, {
    skipLiveWait: true,
  });
  assertCurrentLoad();
  const endTimestamp =
    metadataEndTimestamp ?? (await input.computeDuration(tracks, { skipLiveWait: true }));
  assertCurrentLoad();

  if (videoTrack !== null) {
    const videoCodec = await videoTrack.getCodec();
    assertCurrentLoad();
    const videoDecodable = await videoTrack.canDecode();
    assertCurrentLoad();
    if (videoCodec === null || !videoDecodable) {
      throw new Error(`The browser cannot decode the video track for source "${source.sourceId}".`);
    }

    const alpha = await videoTrack.canBeTransparent();
    assertCurrentLoad();
    controller.videoSink = new mediabunny.CanvasSink(videoTrack, {
      poolSize: 2,
      fit: 'contain',
      alpha,
    });
  }

  let audioDecodable = false;
  if (audioTrack !== null) {
    const audioCodec = await audioTrack.getCodec();
    assertCurrentLoad();
    audioDecodable = await audioTrack.canDecode();
    assertCurrentLoad();
    audioDecodable = audioCodec !== null && audioDecodable;
  }
  if (audioTrack !== null && videoTrack === null && !audioDecodable) {
    throw new Error(`The browser cannot decode the audio track for source "${source.sourceId}".`);
  }

  const [videoMetadata, audioMetadata] = await Promise.all([
    videoTrack === null
      ? null
      : Promise.all([
          videoTrack.getDisplayWidth(),
          videoTrack.getDisplayHeight(),
          videoTrack.getRotation(),
          videoTrack.computePacketStats(100, { skipLiveWait: true }).catch(() => null),
        ]).then(([displayWidth, displayHeight, rotation, packetStats]) => ({
          displayWidth,
          displayHeight,
          rotation,
          detectedFrameRate: packetStats?.averagePacketRate || null,
        })),
    audioTrack === null || !audioDecodable
      ? null
      : audioTrack.getSampleRate().then((sampleRate) => ({ sampleRate })),
  ]);
  assertCurrentLoad();

  if (audioTrack !== null && audioDecodable) {
    assertCurrentLoad();
    controller.audioSink = new mediabunny.AudioBufferSink(audioTrack);
    if (!deferAudioRuntime) {
      const audioRuntime = ensureAudioRuntime(false);
      if (audioRuntime === null) {
        controller.audioSink = null;
      } else {
        controller.audioContext = audioRuntime.context;
        controller.gainNode = audioRuntime.gainNode;
      }
    }
  }

  return {
    metadata: {
      firstTimestampSeconds: firstTimestamp,
      sourceFirstTimestampSeconds: toLogicalSourceSeconds(controller, firstTimestamp),
      presentationStartTimestampSeconds: presentationStartTimestamp,
      endTimestampSeconds: endTimestamp,
      sourceEndTimestampSeconds: toLogicalSourceSeconds(controller, endTimestamp),
      durationSeconds: Math.max(0, endTimestamp - presentationStartTimestamp),
      video: videoMetadata,
      audio: audioMetadata,
    },
  };
}

async function createInput(
  mediabunny: MediabunnyModule,
  sourceInput: MediabunnySourceInput
): Promise<Mediabunny.Input> {
  if (isMediabunnyInputDescriptor(sourceInput) && sourceInput.kind === 'input') {
    return sourceInput.input;
  }
  if (isMediabunnyInputDescriptor(sourceInput) && sourceInput.kind === 'input-factory') {
    return sourceInput.createInput(mediabunny);
  }
  if (isMediabunnyInputDescriptor(sourceInput) && sourceInput.kind === 'url') {
    return new mediabunny.Input({
      source: new mediabunny.UrlSource(sourceInput.url, sourceInput.urlSourceOptions),
      formats: [...(sourceInput.formats ?? mediabunny.ALL_FORMATS)],
    });
  }

  if (
    typeof sourceInput === 'string' ||
    sourceInput instanceof URL ||
    sourceInput instanceof Request
  ) {
    return new mediabunny.Input({
      source: new mediabunny.UrlSource(sourceInput),
      formats: [...mediabunny.ALL_FORMATS],
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
    source: new mediabunnyWithBlobSource.BlobSource(sourceInput),
    formats: mediabunny.ALL_FORMATS,
  });
}

type MediabunnyInputDescriptor = Exclude<
  MediabunnySourceInput,
  string | URL | Request | Blob | File
>;

function isMediabunnyInputDescriptor(
  sourceInput: MediabunnySourceInput
): sourceInput is MediabunnyInputDescriptor {
  return (
    typeof sourceInput !== 'string' &&
    !(sourceInput instanceof URL) &&
    !(sourceInput instanceof Request) &&
    !(sourceInput instanceof Blob)
  );
}

function isSuppliedMediabunnyInput(sourceInput: MediabunnySourceInput) {
  return isMediabunnyInputDescriptor(sourceInput) && sourceInput.kind === 'input';
}
