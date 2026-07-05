import type * as Mediabunny from 'mediabunny';
import type { SourceBinSource } from '@/components/source-bin/types';

interface AudioDecoderEntry {
  sink: Mediabunny.AudioSampleSink;
}

interface VideoDecoderEntry {
  sink: Mediabunny.CanvasSink;
}

export class ExportMediaCache {
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
