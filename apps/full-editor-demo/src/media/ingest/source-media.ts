import type * as Mediabunny from 'mediabunny';
import type { Input } from 'mediabunny';
import type {
  MediaLibraryImportableKind,
  MediaLibraryProbeResult,
} from '@/media/library/media-library-types';

const POSTER_WIDTH = 160;
const POSTER_HEIGHT = 90;
const FRAME_RATE_SAMPLE_PACKET_COUNT = 120;

const videoExtensions = new Set(['m4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'ts', 'webm']);
const audioExtensions = new Set(['aac', 'aiff', 'flac', 'm4a', 'mp3', 'ogg', 'opus', 'wav']);
const imageExtensions = new Set(['avif', 'gif', 'jpeg', 'jpg', 'png', 'webp']);

export function getSupportedSourceKind(file: File): MediaLibraryImportableKind | null {
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
  expectedKind: MediaLibraryImportableKind
): Promise<MediaLibraryProbeResult> {
  if (expectedKind === 'image') {
    return probeImageFile(file);
  }

  return probeTimelineMediaFile(file);
}

async function probeImageFile(file: File): Promise<MediaLibraryProbeResult> {
  const bitmap = await createImageBitmap(file);

  try {
    return {
      kind: 'image',
      metadata: {
        width: bitmap.width,
        height: bitmap.height,
      },
      poster: await createImagePoster(bitmap),
    };
  } finally {
    bitmap.close();
  }
}

async function probeTimelineMediaFile(file: File): Promise<MediaLibraryProbeResult> {
  const mediabunny = await import('mediabunny');
  const input = new mediabunny.Input({
    source: new mediabunny.BlobSource(file),
    formats: mediabunny.ALL_FORMATS,
  });

  try {
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
        poster: null,
      };
    }

    const width = await videoTrack.getDisplayWidth();
    const height = await videoTrack.getDisplayHeight();
    const averageFrameRate = await getAverageFrameRate(videoTrack);
    const poster = await createOptionalVideoPoster(videoTrack, mediabunny, firstTimestamp);

    return {
      kind: 'video',
      metadata: {
        ...(averageFrameRate === undefined ? {} : { averageFrameRate }),
        durationSeconds,
        hasAudio: audioTrack !== null,
        hasVideo: true,
        width,
        height,
      },
      poster,
    };
  } finally {
    input.dispose();
  }
}

async function createOptionalVideoPoster(
  videoTrack: NonNullable<Awaited<ReturnType<Input['getPrimaryVideoTrack']>>>,
  mediabunny: typeof Mediabunny,
  timestampSeconds: number
) {
  try {
    return await createVideoPoster(videoTrack, mediabunny, timestampSeconds);
  } catch {
    return null;
  }
}

async function createVideoPoster(
  videoTrack: NonNullable<Awaited<ReturnType<Input['getPrimaryVideoTrack']>>>,
  mediabunny: typeof Mediabunny,
  timestampSeconds: number
) {
  const sink = new mediabunny.CanvasSink(videoTrack, {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    fit: 'contain',
    alpha: await videoTrack.canBeTransparent(),
  });

  for await (const wrappedCanvas of sink.canvasesAtTimestamps([timestampSeconds])) {
    if (wrappedCanvas === null) {
      return null;
    }

    return createCanvasPoster(wrappedCanvas.canvas);
  }

  return null;
}

async function getAverageFrameRate(
  videoTrack: NonNullable<Awaited<ReturnType<Input['getPrimaryVideoTrack']>>>
) {
  let frameRate: number;
  try {
    const packetStats = await videoTrack.computePacketStats(FRAME_RATE_SAMPLE_PACKET_COUNT, {
      skipLiveWait: true,
    });
    frameRate = packetStats.averagePacketRate;
  } catch {
    return undefined;
  }

  return Number.isFinite(frameRate) && frameRate > 0 ? frameRate : undefined;
}

async function createImagePoster(source: CanvasImageSource) {
  return createCanvasPoster(source);
}

async function createCanvasPoster(source: CanvasImageSource) {
  const canvas = document.createElement('canvas');
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;

  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('Canvas thumbnails are unavailable.');
  }

  context.fillStyle = '#000';
  context.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  context.drawImage(source, 0, 0, POSTER_WIDTH, POSTER_HEIGHT);

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
