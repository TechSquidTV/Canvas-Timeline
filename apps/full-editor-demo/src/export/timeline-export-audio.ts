import type * as Mediabunny from 'mediabunny';
import {
  EXPORT_AUDIO_CHANNELS,
  EXPORT_AUDIO_SAMPLE_RATE,
  EXPORT_SILENCE_CHUNK_SECONDS,
} from '#full-editor/export/timeline-export-constants';
import type { ExportMediaCache } from '#full-editor/export/timeline-export-media-cache';
import { throwIfAborted } from '#full-editor/export/timeline-export-support';
import type {
  TimelineExportPlan,
  TimelineExportProgress,
  TimelineExportSegment,
} from '#full-editor/export/timeline-export-types';

export async function renderAudioTrack(options: {
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

    const durationSeconds = Math.min(
      EXPORT_SILENCE_CHUNK_SECONDS,
      options.endSeconds - cursorSeconds
    );
    const frameCount = Math.max(1, Math.round(durationSeconds * EXPORT_AUDIO_SAMPLE_RATE));
    const sample = new options.mediabunny.AudioSample({
      data: new Float32Array(frameCount * EXPORT_AUDIO_CHANNELS),
      format: 'f32',
      numberOfChannels: EXPORT_AUDIO_CHANNELS,
      sampleRate: EXPORT_AUDIO_SAMPLE_RATE,
      timestamp: cursorSeconds,
    });

    await options.audioSource.add(sample);
    sample.close();
    cursorSeconds += frameCount / EXPORT_AUDIO_SAMPLE_RATE;
  }
}
