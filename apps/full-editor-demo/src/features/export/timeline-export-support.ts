import type * as Mediabunny from 'mediabunny';
import {
  EXPORT_AUDIO_CHANNELS,
  EXPORT_AUDIO_SAMPLE_RATE,
} from '#full-editor/features/export/timeline-export-constants';
import type { TimelineExportPlan } from '#full-editor/features/export/timeline-export-types';

export async function ensureMp4EncodeSupport(
  mediabunny: typeof Mediabunny,
  plan: TimelineExportPlan
) {
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
    numberOfChannels: EXPORT_AUDIO_CHANNELS,
    sampleRate: EXPORT_AUDIO_SAMPLE_RATE,
  });

  if (nativeAac) {
    return;
  }

  const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
  registerAacEncoder();

  const extensionAac = await mediabunny.canEncodeAudio('aac', {
    bitrate: plan.profile.audioBitrate,
    numberOfChannels: EXPORT_AUDIO_CHANNELS,
    sampleRate: EXPORT_AUDIO_SAMPLE_RATE,
  });

  if (!extensionAac) {
    throw new Error('MP4 AAC export is not supported by this browser.');
  }
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

export function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted === true) {
    throw new DOMException('Export canceled.', 'AbortError');
  }
}
