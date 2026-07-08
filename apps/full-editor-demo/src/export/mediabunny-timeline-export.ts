import { renderAudioTrack } from '#full-editor/export/timeline-export-audio';
import {
  EXPORT_AUDIO_CHANNELS,
  EXPORT_AUDIO_SAMPLE_RATE,
} from '#full-editor/export/timeline-export-constants';
import { ExportMediaCache } from '#full-editor/export/timeline-export-media-cache';
import {
  downloadTimelineExport,
  ensureMp4EncodeSupport,
  throwIfAborted,
} from '#full-editor/export/timeline-export-support';
import { renderVideoTrack } from '#full-editor/export/timeline-export-video';
import type {
  TimelineExportPlan,
  TimelineExportProgress,
} from '#full-editor/export/timeline-export-types';

interface TimelineExportRunOptions {
  onProgress?: (progress: TimelineExportProgress) => void;
  signal?: AbortSignal;
}

export { downloadTimelineExport };

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
            numberOfChannels: EXPORT_AUDIO_CHANNELS,
            sampleFormat: 'f32',
            sampleRate: EXPORT_AUDIO_SAMPLE_RATE,
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
