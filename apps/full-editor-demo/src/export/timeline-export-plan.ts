import type { Track } from '@techsquidtv/canvas-timeline-core';
import { compareRational, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import type { EditorTrackKind } from '@/data/demo-project';
import type { SourceBinSource } from '@/components/source-bin/types';
import type {
  TimelineExportPlanInput,
  TimelineExportPlanResult,
  TimelineExportSegment,
  TimelineExportValidationIssue,
} from './timeline-export-types';

export function createTimelineExportPlan(input: TimelineExportPlanInput): TimelineExportPlanResult {
  const issues: TimelineExportValidationIssue[] = [];
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));
  const videoSegments = collectSegments({
    issues,
    kind: 'visual',
    sourceById,
    tracks: input.state.tracks,
  });
  const audioSegments = collectSegments({
    issues,
    kind: 'audio',
    sourceById,
    tracks: input.state.tracks,
  });

  if (videoSegments.length === 0) {
    issues.push({ message: 'Add at least one visual clip to export.' });
  }

  validateNoOverlap(videoSegments, 'video', issues);
  validateNoOverlap(audioSegments, 'audio', issues);

  const endSeconds = getExportEndSeconds(input, [...videoSegments, ...audioSegments]);
  if (endSeconds <= 0) {
    issues.push({ message: 'Timeline content has no exportable duration.' });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    plan: {
      audioSegments,
      durationSeconds: endSeconds,
      endSeconds,
      profile: input.profile,
      videoSegments,
    },
  };
}

function collectSegments(options: {
  issues: TimelineExportValidationIssue[];
  kind: EditorTrackKind;
  sourceById: ReadonlyMap<string, SourceBinSource>;
  tracks: readonly Track[];
}) {
  const segments: TimelineExportSegment[] = [];
  const tracks = options.tracks.filter((track) => shouldExportTrack(track, options.kind));

  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.disabled === true) {
        continue;
      }

      const source = options.sourceById.get(clip.sourceId);
      if (source === undefined) {
        options.issues.push({ message: `Missing source for clip "${clip.label ?? clip.id}".` });
        continue;
      }

      if (!isExportableSource(source)) {
        options.issues.push({ message: `Source "${source.name}" is not ready for export.` });
        continue;
      }

      if (!isSourceCompatibleWithTrack(source, options.kind)) {
        options.issues.push({
          message: `Source "${source.name}" cannot be exported on ${track.name}.`,
        });
        continue;
      }

      segments.push({
        clip,
        endSeconds: toSeconds(clip.timelineEnd),
        source,
        sourceStartSeconds: toSeconds(clip.sourceStart),
        startSeconds: toSeconds(clip.timelineStart),
        track,
      });
    }
  }

  return segments.sort((left, right) => {
    const timeCompare = compareRational(left.clip.timelineStart, right.clip.timelineStart);
    return timeCompare === 0 ? left.track.id.localeCompare(right.track.id) : timeCompare;
  });
}

function isExportableSource(source: SourceBinSource): source is SourceBinSource & { file: File } {
  return source.status === 'ready' && source.file !== null;
}

function shouldExportTrack(track: Track, kind: EditorTrackKind): track is Track<EditorTrackKind> {
  if (track.kind !== kind || track.muted === true) {
    return false;
  }

  return kind === 'audio' || track.visible !== false;
}

function isSourceCompatibleWithTrack(source: SourceBinSource, kind: EditorTrackKind) {
  if (kind === 'visual') {
    return source.kind === 'image' || source.metadata.hasVideo === true;
  }

  return source.kind === 'audio' || source.metadata.hasAudio === true;
}

function validateNoOverlap(
  segments: readonly TimelineExportSegment[],
  label: string,
  issues: TimelineExportValidationIssue[]
) {
  for (let index = 1; index < segments.length; index++) {
    const previous = segments[index - 1];
    const current = segments[index];

    if (previous.endSeconds > current.startSeconds) {
      issues.push({
        message: `Overlapping ${label} clips are not supported by simple export yet.`,
      });
      return;
    }
  }
}

function getExportEndSeconds(
  input: TimelineExportPlanInput,
  segments: readonly TimelineExportSegment[]
) {
  const contentEndSeconds = segments.reduce(
    (currentEndSeconds, segment) => Math.max(currentEndSeconds, segment.endSeconds),
    0
  );
  const durationSeconds =
    input.state.duration === undefined ? contentEndSeconds : toSeconds(input.state.duration);

  return Math.max(0, Math.min(contentEndSeconds, durationSeconds));
}
