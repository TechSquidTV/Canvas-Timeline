import type { TimelineClipGroupPlacement, Track } from '@techsquidtv/canvas-timeline-core';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import type { EditorTrackKind } from '#full-editor/features/project/demo-project';
import type { MediaLibrarySource } from '#full-editor/features/media/library/media-library-types';
import {
  createClipFromSource,
  getSourceClipDurationSeconds,
} from '#full-editor/features/timeline/source-clip-factory';

export type SourceDropRejectReason =
  | 'missing-companion-track'
  | 'source-not-ready'
  | 'track-kind-mismatch'
  | 'unsupported-source';

interface SourceDropTrackResolution {
  audioTrack?: Track<EditorTrackKind>;
  reason?: SourceDropRejectReason;
  visualTrack?: Track<EditorTrackKind>;
}

export interface SourceDropPatch extends SourceDropTrackResolution {
  durationSeconds: number;
  hasLinkedAudioVideo: boolean;
}

export interface CreateSourceDropPlacementsOptions {
  source: MediaLibrarySource;
  startTime: RationalTime;
  targetTrack: Track<EditorTrackKind>;
  tracks: readonly Track<EditorTrackKind>[];
}

export function canCreateSourceDropPlacements(options: CreateSourceDropPlacementsOptions) {
  return resolveSourceDropPatch(options).reason === undefined;
}

export function createSourceDropPlacements(
  options: CreateSourceDropPlacementsOptions
): readonly TimelineClipGroupPlacement[] | null {
  const resolution = resolveSourceDropPatch(options);
  if (resolution.reason !== undefined) {
    return null;
  }

  const importGroupId = `import-${crypto.randomUUID()}`;
  const placements: TimelineClipGroupPlacement[] = [];

  if (resolution.visualTrack !== undefined) {
    placements.push({
      clip: createClipFromSource(options.source, {
        importGroupId,
        startTime: options.startTime,
        trackKind: 'visual',
      }),
      targetTrackId: resolution.visualTrack.id,
      startTime: options.startTime,
    });
  }

  if (resolution.audioTrack !== undefined) {
    placements.push({
      clip: createClipFromSource(options.source, {
        importGroupId,
        startTime: options.startTime,
        trackKind: 'audio',
      }),
      targetTrackId: resolution.audioTrack.id,
      startTime: options.startTime,
    });
  }

  return placements.length === 0 ? null : placements;
}

export function resolveSourceDropPatch({
  source,
  targetTrack,
  tracks,
}: Omit<CreateSourceDropPlacementsOptions, 'startTime'>): SourceDropPatch {
  const durationSeconds = getSourceClipDurationSeconds(source);
  if (source.status !== 'ready') {
    return {
      durationSeconds,
      hasLinkedAudioVideo: false,
      reason: 'source-not-ready',
    };
  }

  const needsVisual =
    source.kind === 'image' || source.kind === 'video' || source.metadata.hasVideo === true;
  const needsAudio = source.kind === 'audio' || source.metadata.hasAudio === true;
  const hasLinkedAudioVideo = needsVisual && needsAudio;

  if (!needsVisual && !needsAudio) {
    return {
      durationSeconds,
      hasLinkedAudioVideo,
      reason: 'unsupported-source',
    };
  }

  if (hasLinkedAudioVideo) {
    return {
      ...resolveLinkedAudioVideoDrop(targetTrack, tracks),
      durationSeconds,
      hasLinkedAudioVideo,
    };
  }

  if (needsVisual) {
    return targetTrack.kind === 'visual'
      ? { durationSeconds, hasLinkedAudioVideo, visualTrack: targetTrack }
      : { durationSeconds, hasLinkedAudioVideo, reason: 'track-kind-mismatch' };
  }

  return targetTrack.kind === 'audio'
    ? { audioTrack: targetTrack, durationSeconds, hasLinkedAudioVideo }
    : { durationSeconds, hasLinkedAudioVideo, reason: 'track-kind-mismatch' };
}

function resolveLinkedAudioVideoDrop(
  targetTrack: Track<EditorTrackKind>,
  tracks: readonly Track<EditorTrackKind>[]
): SourceDropTrackResolution {
  const targetTrackIndex = tracks.findIndex((track) => track.id === targetTrack.id);

  if (targetTrack.kind === 'visual') {
    const audioTrack = findCompanionTrack(tracks, 'audio', targetTrackIndex);
    return audioTrack === undefined
      ? { reason: 'missing-companion-track' }
      : { visualTrack: targetTrack, audioTrack };
  }

  const visualTrack = findCompanionTrack(tracks, 'visual', targetTrackIndex);
  return visualTrack === undefined
    ? { reason: 'missing-companion-track' }
    : { visualTrack, audioTrack: targetTrack };
}

function findCompanionTrack(
  tracks: readonly Track<EditorTrackKind>[],
  kind: EditorTrackKind,
  targetTrackIndex: number
): Track<EditorTrackKind> | undefined {
  return (
    tracks.find((track) => track.kind === kind && !track.locked && track.targeted) ??
    findNearestUnlockedTrack(tracks, kind, targetTrackIndex)
  );
}

function findNearestUnlockedTrack(
  tracks: readonly Track<EditorTrackKind>[],
  kind: EditorTrackKind,
  targetTrackIndex: number
): Track<EditorTrackKind> | undefined {
  const compatibleTracks = tracks
    .map((track, index) => ({ index, track }))
    .filter(({ track }) => track.kind === kind && !track.locked);

  return [...compatibleTracks].sort(
    (left, right) =>
      Math.abs(left.index - targetTrackIndex) - Math.abs(right.index - targetTrackIndex)
  )[0]?.track;
}
