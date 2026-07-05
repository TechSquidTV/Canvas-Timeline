import type { Clip } from '@techsquidtv/canvas-timeline-core';
import { addRational, fromSeconds, type RationalTime } from '@techsquidtv/canvas-timeline-utils';
import type { EditorTrackKind } from '@/data/demo-project';
import type { MediaLibrarySource } from '@/media/library/media-library-types';

const DEFAULT_STILL_DURATION_SECONDS = 5;

export interface CreateSourceClipOptions {
  clipId?: string;
  duration?: RationalTime;
  importGroupId?: string;
  sourceStart?: RationalTime;
  startTime: RationalTime;
  trackKind: EditorTrackKind;
}

export interface LinkedSourceClips {
  audio?: Clip;
  importGroupId: string;
  visual?: Clip;
}

export function createClipFromSource(
  source: MediaLibrarySource,
  options: CreateSourceClipOptions
): Clip {
  const sourceStart = options.sourceStart ?? fromSeconds(0, options.startTime.r);
  const duration = options.duration ?? getDefaultClipDuration(source, options.startTime.r);

  return {
    id: options.clipId ?? `clip-${crypto.randomUUID()}`,
    sourceId: source.id,
    timelineStart: options.startTime,
    timelineEnd: addRational(options.startTime, duration),
    sourceStart,
    selected: false,
    label: source.name,
    metadata: {
      importGroupId: options.importGroupId,
      sourceKind: source.kind,
      trackKind: options.trackKind,
    },
  };
}

export function createLinkedSourceClips(
  source: MediaLibrarySource,
  options: {
    startTime: RationalTime;
    importGroupId?: string;
  }
): LinkedSourceClips {
  const importGroupId = options.importGroupId ?? `import-${crypto.randomUUID()}`;
  const clips: LinkedSourceClips = { importGroupId };

  if (source.kind === 'video' || source.kind === 'image' || source.metadata.hasVideo === true) {
    clips.visual = createClipFromSource(source, {
      importGroupId,
      startTime: options.startTime,
      trackKind: 'visual',
    });
  }

  if (source.kind === 'audio' || source.metadata.hasAudio === true) {
    clips.audio = createClipFromSource(source, {
      importGroupId,
      startTime: options.startTime,
      trackKind: 'audio',
    });
  }

  return clips;
}

function getDefaultClipDuration(source: MediaLibrarySource, timebase: number) {
  const durationSeconds = source.metadata.durationSeconds;
  const seconds =
    durationSeconds === undefined || durationSeconds <= 0
      ? DEFAULT_STILL_DURATION_SECONDS
      : durationSeconds;

  return fromSeconds(seconds, timebase);
}
