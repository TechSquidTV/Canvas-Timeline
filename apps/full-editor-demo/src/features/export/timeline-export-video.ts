import type * as Mediabunny from 'mediabunny';
import type { ExportMediaCache } from '#full-editor/features/export/timeline-export-media-cache';
import { throwIfAborted } from '#full-editor/features/export/timeline-export-support';
import type {
  TimelineExportPlan,
  TimelineExportProgress,
} from '#full-editor/features/export/timeline-export-types';

export async function renderVideoTrack(options: {
  cache: ExportMediaCache;
  context: CanvasRenderingContext2D;
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
