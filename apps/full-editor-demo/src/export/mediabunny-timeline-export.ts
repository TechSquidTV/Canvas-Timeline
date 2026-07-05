import type * as Mediabunny from 'mediabunny';
import type { SourceBinSource } from '@/components/source-bin/types';
import type {
  TimelineExportPlan,
  TimelineExportProgress,
  TimelineExportSegment,
} from './timeline-export-types';

interface TimelineExportRunOptions {
  onProgress?: (progress: TimelineExportProgress) => void;
  signal?: AbortSignal;
}

interface VideoDecoderEntry {
  sink: Mediabunny.CanvasSink;
}

interface AudioDecoderEntry {
  sink: Mediabunny.AudioSampleSink;
}

const AUDIO_SAMPLE_RATE = 48_000;
const AUDIO_CHANNELS = 2;
const SILENCE_CHUNK_SECONDS = 0.1;

export async function runTimelineExport(
  plan: TimelineExportPlan,
  options: TimelineExportRunOptions = {}
) {
  const mediabunny = await import('mediabunny');
  await ensureMp4EncodeSupport(mediabunny, plan);

  throwIfAborted(options.signal);

  const target = new mediabunny.BufferTarget();
  const output = new mediabunny.Output({
    format: new mediabunny.Mp4OutputFormat(),
    target,
  });
  const canvas = document.createElement('canvas');
  canvas.width = plan.profile.resolution.width;
  canvas.height = plan.profile.resolution.height;

  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('Canvas export is unavailable in this browser.');
  }

  const videoSource = new mediabunny.CanvasSource(canvas, {
    bitrate: plan.profile.resolution.videoBitrate,
    codec: 'avc',
    keyFrameInterval: 2,
  });
  output.addVideoTrack(videoSource, {
    frameRate: plan.profile.frameRate,
  });

  const audioSource =
    plan.audioSegments.length === 0
      ? null
      : new mediabunny.AudioSampleSource({
          bitrate: plan.profile.audioBitrate,
          codec: 'aac',
          transform: {
            numberOfChannels: AUDIO_CHANNELS,
            sampleFormat: 'f32',
            sampleRate: AUDIO_SAMPLE_RATE,
          },
        });

  if (audioSource !== null) {
    output.addAudioTrack(audioSource);
  }

  await output.start();

  const cache = new ExportMediaCache(mediabunny);
  try {
    await renderVideoTrack({
      cache,
      context,
      mediabunny,
      onProgress: options.onProgress,
      plan,
      signal: options.signal,
      videoSource,
    });

    if (audioSource !== null) {
      await renderAudioTrack({
        audioSource,
        cache,
        mediabunny,
        onProgress: options.onProgress,
        plan,
        signal: options.signal,
      });
    }

    options.onProgress?.({ phase: 'finalizing', progress: 1 });
    throwIfAborted(options.signal);
    await output.finalize();
  } catch (error) {
    await output.cancel();
    throw error;
  } finally {
    cache.close();
  }

  if (target.buffer === null) {
    throw new Error('Export did not produce an output buffer.');
  }

  return new Blob([target.buffer], { type: 'video/mp4' });
}

export function downloadTimelineExport(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function ensureMp4EncodeSupport(mediabunny: typeof Mediabunny, plan: TimelineExportPlan) {
  const canEncodeVideo = await mediabunny.canEncodeVideo('avc', {
    bitrate: plan.profile.resolution.videoBitrate,
    height: plan.profile.resolution.height,
    width: plan.profile.resolution.width,
  });

  if (!canEncodeVideo) {
    throw new Error('MP4 H.264 export is not supported by this browser.');
  }

  if (plan.audioSegments.length === 0) {
    return;
  }

  const nativeAac = await mediabunny.canEncodeAudio('aac', {
    bitrate: plan.profile.audioBitrate,
    numberOfChannels: AUDIO_CHANNELS,
    sampleRate: AUDIO_SAMPLE_RATE,
  });

  if (nativeAac) {
    return;
  }

  const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
  registerAacEncoder();

  const extensionAac = await mediabunny.canEncodeAudio('aac', {
    bitrate: plan.profile.audioBitrate,
    numberOfChannels: AUDIO_CHANNELS,
    sampleRate: AUDIO_SAMPLE_RATE,
  });

  if (!extensionAac) {
    throw new Error('MP4 AAC export is not supported by this browser.');
  }
}

async function renderVideoTrack(options: {
  cache: ExportMediaCache;
  context: CanvasRenderingContext2D;
  mediabunny: typeof Mediabunny;
  onProgress?: (progress: TimelineExportProgress) => void;
  plan: TimelineExportPlan;
  signal?: AbortSignal;
  videoSource: Mediabunny.CanvasSource;
}) {
  const { context, plan, signal, videoSource } = options;
  const frameDurationSeconds = 1 / plan.profile.frameRate;
  const frameCount = Math.max(1, Math.ceil(plan.durationSeconds * plan.profile.frameRate));

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    throwIfAborted(signal);

    const timestampSeconds = frameIndex * frameDurationSeconds;
    await drawVideoFrame({
      cache: options.cache,
      context,
      height: plan.profile.resolution.height,
      plan,
      timestampSeconds,
      width: plan.profile.resolution.width,
    });
    await videoSource.add(timestampSeconds, frameDurationSeconds, {
      keyFrame: frameIndex % Math.max(1, Math.round(plan.profile.frameRate * 2)) === 0,
    });

    options.onProgress?.({
      phase: 'video',
      progress: (frameIndex + 1) / frameCount,
    });
  }
}

async function drawVideoFrame(options: {
  cache: ExportMediaCache;
  context: CanvasRenderingContext2D;
  height: number;
  plan: TimelineExportPlan;
  timestampSeconds: number;
  width: number;
}) {
  const segment = options.plan.videoSegments.find(
    (candidate) =>
      candidate.startSeconds <= options.timestampSeconds &&
      candidate.endSeconds > options.timestampSeconds
  );

  options.context.fillStyle = '#000';
  options.context.fillRect(0, 0, options.width, options.height);

  if (segment === undefined) {
    return;
  }

  if (segment.source.kind === 'image') {
    const bitmap = await options.cache.getImageBitmap(segment.source);
    drawContained(options.context, bitmap, options.width, options.height);
    return;
  }

  const decoder = await options.cache.getVideoDecoder(segment.source);
  const sourceTimestampSeconds =
    segment.sourceStartSeconds + options.timestampSeconds - segment.startSeconds;
  const wrappedCanvas = await decoder.sink.getCanvas(Math.max(0, sourceTimestampSeconds));

  if (wrappedCanvas !== null) {
    drawContained(options.context, wrappedCanvas.canvas, options.width, options.height);
  }
}

async function renderAudioTrack(options: {
  audioSource: Mediabunny.AudioSampleSource;
  cache: ExportMediaCache;
  mediabunny: typeof Mediabunny;
  onProgress?: (progress: TimelineExportProgress) => void;
  plan: TimelineExportPlan;
  signal?: AbortSignal;
}) {
  let cursorSeconds = 0;
  const segmentCount = Math.max(1, options.plan.audioSegments.length);

  for (const [index, segment] of options.plan.audioSegments.entries()) {
    throwIfAborted(options.signal);

    const segmentStartSeconds = Math.max(0, segment.startSeconds);
    const segmentEndSeconds = Math.min(options.plan.endSeconds, segment.endSeconds);
    if (segmentStartSeconds > cursorSeconds) {
      await addSilence({
        audioSource: options.audioSource,
        endSeconds: segmentStartSeconds,
        mediabunny: options.mediabunny,
        signal: options.signal,
        startSeconds: cursorSeconds,
      });
    }

    await addAudioSegment({
      audioSource: options.audioSource,
      cache: options.cache,
      endSeconds: segmentEndSeconds,
      segment,
      signal: options.signal,
      startSeconds: segmentStartSeconds,
    });
    cursorSeconds = Math.max(cursorSeconds, segmentEndSeconds);

    options.onProgress?.({
      phase: 'audio',
      progress: (index + 1) / segmentCount,
    });
  }

  if (cursorSeconds < options.plan.durationSeconds) {
    await addSilence({
      audioSource: options.audioSource,
      endSeconds: options.plan.durationSeconds,
      mediabunny: options.mediabunny,
      signal: options.signal,
      startSeconds: cursorSeconds,
    });
  }
}

async function addAudioSegment(options: {
  audioSource: Mediabunny.AudioSampleSource;
  cache: ExportMediaCache;
  endSeconds: number;
  segment: TimelineExportSegment;
  signal?: AbortSignal;
  startSeconds: number;
}) {
  const decoder = await options.cache.getAudioDecoder(options.segment.source);
  const sourceStartSeconds = options.segment.sourceStartSeconds;
  const sourceEndSeconds = sourceStartSeconds + options.endSeconds - options.startSeconds;

  for await (const sample of decoder.sink.samples(sourceStartSeconds, sourceEndSeconds)) {
    throwIfAborted(options.signal);

    const trimmedSample = trimAudioSample(sample, sourceStartSeconds, sourceEndSeconds);
    sample.close();

    if (trimmedSample === null) {
      continue;
    }

    trimmedSample.setTimestamp(
      options.startSeconds + Math.max(0, trimmedSample.timestamp - sourceStartSeconds)
    );
    await options.audioSource.add(trimmedSample);
    trimmedSample.close();
  }
}

function trimAudioSample(sample: Mediabunny.AudioSample, startSeconds: number, endSeconds: number) {
  const sampleStartSeconds = sample.timestamp;
  const sampleEndSeconds = sample.timestamp + sample.duration;
  const trimStartSeconds = Math.max(sampleStartSeconds, startSeconds);
  const trimEndSeconds = Math.min(sampleEndSeconds, endSeconds);

  if (trimEndSeconds <= trimStartSeconds) {
    return null;
  }

  const startFrame = Math.max(
    0,
    Math.floor((trimStartSeconds - sampleStartSeconds) * sample.sampleRate)
  );
  const endFrame = Math.min(
    sample.numberOfFrames,
    Math.ceil((trimEndSeconds - sampleStartSeconds) * sample.sampleRate)
  );

  return endFrame <= startFrame ? null : sample.trim(startFrame, endFrame);
}

async function addSilence(options: {
  audioSource: Mediabunny.AudioSampleSource;
  endSeconds: number;
  mediabunny: typeof Mediabunny;
  signal?: AbortSignal;
  startSeconds: number;
}) {
  let cursorSeconds = options.startSeconds;

  while (cursorSeconds < options.endSeconds) {
    throwIfAborted(options.signal);

    const durationSeconds = Math.min(SILENCE_CHUNK_SECONDS, options.endSeconds - cursorSeconds);
    const frameCount = Math.max(1, Math.round(durationSeconds * AUDIO_SAMPLE_RATE));
    const sample = new options.mediabunny.AudioSample({
      data: new Float32Array(frameCount * AUDIO_CHANNELS),
      format: 'f32',
      numberOfChannels: AUDIO_CHANNELS,
      sampleRate: AUDIO_SAMPLE_RATE,
      timestamp: cursorSeconds,
    });

    await options.audioSource.add(sample);
    sample.close();
    cursorSeconds += frameCount / AUDIO_SAMPLE_RATE;
  }
}

function drawContained(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number
) {
  const sourceWidth = getCanvasImageSourceWidth(source);
  const sourceHeight = getCanvasImageSourceHeight(source);

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return;
  }

  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(
    source,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight
  );
}

function getCanvasImageSourceWidth(source: CanvasImageSource) {
  if ('displayWidth' in source) {
    return source.displayWidth;
  }

  if ('videoWidth' in source) {
    return source.videoWidth;
  }

  return typeof source.width === 'number' ? source.width : source.width.baseVal.value;
}

function getCanvasImageSourceHeight(source: CanvasImageSource) {
  if ('displayHeight' in source) {
    return source.displayHeight;
  }

  if ('videoHeight' in source) {
    return source.videoHeight;
  }

  return typeof source.height === 'number' ? source.height : source.height.baseVal.value;
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted === true) {
    throw new DOMException('Export canceled.', 'AbortError');
  }
}

class ExportMediaCache {
  private readonly audioDecoders = new Map<string, Promise<AudioDecoderEntry>>();
  private readonly bitmaps = new Map<string, Promise<ImageBitmap>>();
  private readonly mediabunny: typeof Mediabunny;
  private readonly videoDecoders = new Map<string, Promise<VideoDecoderEntry>>();

  constructor(mediabunny: typeof Mediabunny) {
    this.mediabunny = mediabunny;
  }

  close() {
    for (const bitmapPromise of this.bitmaps.values()) {
      void bitmapPromise.then((bitmap) => bitmap.close());
    }
  }

  getAudioDecoder(source: SourceBinSource & { file: File }) {
    return getOrCreate(this.audioDecoders, source.id, async () => {
      const input = this.createInput(source.file);
      const audioTrack = await input.getPrimaryAudioTrack();

      if (audioTrack === null) {
        throw new Error(`Source "${source.name}" has no audio track.`);
      }

      return {
        sink: new this.mediabunny.AudioSampleSink(audioTrack),
      };
    });
  }

  getImageBitmap(source: SourceBinSource & { file: File }) {
    return getOrCreate(this.bitmaps, source.id, () => createImageBitmap(source.file));
  }

  getVideoDecoder(source: SourceBinSource & { file: File }) {
    return getOrCreate(this.videoDecoders, source.id, async () => {
      const input = this.createInput(source.file);
      const videoTrack = await input.getPrimaryVideoTrack();

      if (videoTrack === null) {
        throw new Error(`Source "${source.name}" has no video track.`);
      }

      return {
        sink: new this.mediabunny.CanvasSink(videoTrack, {
          alpha: await videoTrack.canBeTransparent(),
        }),
      };
    });
  }

  private createInput(file: File) {
    return new this.mediabunny.Input({
      formats: this.mediabunny.ALL_FORMATS,
      source: new this.mediabunny.BlobSource(file),
    });
  }
}

function getOrCreate<Key, Value>(
  map: Map<Key, Promise<Value>>,
  key: Key,
  createValue: () => Promise<Value>
) {
  const existingValue = map.get(key);
  if (existingValue !== undefined) {
    return existingValue;
  }

  const value = createValue();
  map.set(key, value);
  return value;
}
