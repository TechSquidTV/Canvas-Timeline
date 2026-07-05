import type * as Mediabunny from 'mediabunny';
import type { Input } from 'mediabunny';
import type { SourceBinImportableKind, SourceBinProbeResult } from './types';

const THUMBNAIL_WIDTH = 160;
const THUMBNAIL_HEIGHT = 90;

const videoExtensions = new Set(['m4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'ts', 'webm']);
const audioExtensions = new Set(['aac', 'aiff', 'flac', 'm4a', 'mp3', 'ogg', 'opus', 'wav']);
const imageExtensions = new Set(['avif', 'gif', 'jpeg', 'jpg', 'png', 'webp']);

export function getSupportedSourceKind(file: File): SourceBinImportableKind | null {
  if (file.type.startsWith('video/')) {
    return 'video';
  }

  if (file.type.startsWith('audio/')) {
    return 'audio';
  }

  if (file.type.startsWith('image/')) {
    return 'image';
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === undefined) {
    return null;
  }

  if (videoExtensions.has(extension)) {
    return 'video';
  }

  if (audioExtensions.has(extension)) {
    return 'audio';
  }

  return imageExtensions.has(extension) ? 'image' : null;
}

export async function probeSourceFile(
  file: File,
  expectedKind: SourceBinImportableKind
): Promise<SourceBinProbeResult> {
  if (expectedKind === 'image') {
    return probeImageFile(file);
  }

  return probeTimelineMediaFile(file);
}

async function probeImageFile(file: File): Promise<SourceBinProbeResult> {
  const bitmap = await createImageBitmap(file);

  try {
    return {
      kind: 'image',
      metadata: {
        width: bitmap.width,
        height: bitmap.height,
      },
      thumbnail: await createImageThumbnail(bitmap),
    };
  } finally {
    bitmap.close();
  }
}

async function probeTimelineMediaFile(file: File): Promise<SourceBinProbeResult> {
  const mediabunny = await import('mediabunny');
  const input = new mediabunny.Input({
    source: new mediabunny.BlobSource(file),
    formats: mediabunny.ALL_FORMATS,
  });
  const videoTrack = await input.getPrimaryVideoTrack();
  const audioTrack = await input.getPrimaryAudioTrack();
  type InputTrack = NonNullable<typeof videoTrack> | NonNullable<typeof audioTrack>;
  const tracks = [videoTrack, audioTrack].filter((track): track is InputTrack => track !== null);

  if (tracks.length === 0) {
    throw new Error('No audio or video track found.');
  }

  if (videoTrack !== null) {
    if ((await videoTrack.getCodec()) === null) {
      throw new Error('Unsupported video codec.');
    }

    if (!(await videoTrack.canDecode())) {
      throw new Error('Unable to decode the video track.');
    }
  }

  if (audioTrack !== null) {
    if ((await audioTrack.getCodec()) === null) {
      throw new Error('Unsupported audio codec.');
    }

    if (!(await audioTrack.canDecode())) {
      throw new Error('Unable to decode the audio track.');
    }
  }

  const firstTimestamp = Math.max(await input.getFirstTimestamp(tracks), 0);
  const endTimestamp =
    (await input.getDurationFromMetadata(tracks, { skipLiveWait: true })) ??
    (await input.computeDuration(tracks, { skipLiveWait: true }));
  const durationSeconds = Math.max(0, endTimestamp - firstTimestamp);

  if (videoTrack === null) {
    return {
      kind: 'audio',
      metadata: {
        durationSeconds,
        hasAudio: audioTrack !== null,
        hasVideo: false,
      },
      thumbnail: null,
    };
  }

  const width = await videoTrack.getDisplayWidth();
  const height = await videoTrack.getDisplayHeight();
  const thumbnail = await createVideoThumbnail(videoTrack, mediabunny, firstTimestamp);

  return {
    kind: 'video',
    metadata: {
      durationSeconds,
      width,
      height,
      hasAudio: audioTrack !== null,
      hasVideo: true,
    },
    thumbnail,
  };
}

async function createVideoThumbnail(
  videoTrack: NonNullable<Awaited<ReturnType<Input['getPrimaryVideoTrack']>>>,
  mediabunny: typeof Mediabunny,
  timestampSeconds: number
) {
  const sink = new mediabunny.CanvasSink(videoTrack, {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    fit: 'contain',
    alpha: await videoTrack.canBeTransparent(),
  });

  for await (const wrappedCanvas of sink.canvasesAtTimestamps([timestampSeconds])) {
    if (wrappedCanvas === null) {
      return null;
    }

    return createCanvasThumbnail(wrappedCanvas.canvas);
  }

  return null;
}

async function createImageThumbnail(source: CanvasImageSource) {
  return createCanvasThumbnail(source);
}

async function createCanvasThumbnail(source: CanvasImageSource) {
  const canvas = document.createElement('canvas');
  canvas.width = THUMBNAIL_WIDTH;
  canvas.height = THUMBNAIL_HEIGHT;

  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('Canvas thumbnails are unavailable.');
  }

  context.fillStyle = '#000';
  context.fillRect(0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
  context.drawImage(source, 0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);

  return canvasToBlob(canvas);
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error('Unable to encode source thumbnail.'));
        return;
      }

      resolve(blob);
    }, 'image/webp');
  });
}
