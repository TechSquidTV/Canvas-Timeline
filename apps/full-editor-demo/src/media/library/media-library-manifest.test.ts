import { describe, expect, it } from 'vite-plus/test';
import { parseMediaLibraryManifest } from '#full-editor/media/library/media-library-manifest';

describe('media library manifest', () => {
  it('parses a fully valid manifest', () => {
    const manifest = {
      version: 1,
      sources: [
        {
          id: 'source-video',
          kind: 'video',
          metadata: { durationSeconds: 10, hasVideo: true },
          mimeType: 'video/mp4',
          name: 'video.mp4',
          originalPath: 'assets/source-video/original',
          sizeBytes: 1024,
          status: 'ready',
        },
      ],
    };

    expect(parseMediaLibraryManifest(JSON.stringify(manifest))).toEqual(manifest);
  });

  it('rejects unsupported manifest versions instead of treating them as empty', () => {
    expect(() => parseMediaLibraryManifest(JSON.stringify({ version: 2, sources: [] }))).toThrow(
      'Unsupported or invalid media library manifest.'
    );
  });

  it('rejects the complete manifest when any source is invalid', () => {
    const manifest = {
      version: 1,
      sources: [
        {
          id: 'source-valid',
          kind: 'audio',
          metadata: { hasAudio: true },
          mimeType: 'audio/mp4',
          name: 'audio.m4a',
          originalPath: 'assets/source-valid/original',
          sizeBytes: 512,
          status: 'ready',
        },
        {
          id: 'source-invalid',
          kind: 'video',
        },
      ],
    };

    expect(() => parseMediaLibraryManifest(JSON.stringify(manifest))).toThrow(
      'Media library manifest contains an invalid source.'
    );
  });
});
