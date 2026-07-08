import type { Clip } from '@techsquidtv/canvas-timeline-core';
import { addRational, fromSeconds, type RationalTime } from '@techsquidtv/canvas-timeline-utils';
import type { EditorTrackKind } from '#full-editor/data/demo-project';
import type { MediaLibrarySource } from '#full-editor/media/library/media-library-types';

const DEFAULT_STILL_DURATION_SECONDS = 5;

export interface CreateSourceClipOptions {
  clipId?: string;
  duration?: RationalTime;
  importGroupId?: string;
  sourceStart?: RationalTime;
  startTime: RationalTime;
  trackKind: EditorTrackKind;
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

function getDefaultClipDuration(source: MediaLibrarySource, timebase: number) {
  return fromSeconds(getSourceClipDurationSeconds(source), timebase);
}

export function getSourceClipDurationSeconds(source: MediaLibrarySource) {
  const durationSeconds = source.metadata.durationSeconds;
  return durationSeconds === undefined || durationSeconds <= 0
    ? DEFAULT_STILL_DURATION_SECONDS
    : durationSeconds;
}
