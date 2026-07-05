import type { Clip, TimelineState, Track } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { describe, expect, it } from 'vite-plus/test';
import type { SourceBinSource } from '@/components/source-bin/types';
import type { EditorTrackKind } from '@/data/demo-project';
import { getDefaultProjectMetadata } from '@/persistence/project/project-store';
import {
  createTimelineExportProfile,
  getTimelineExportResolutionOptions,
  normalizeExportFilename,
} from './timeline-export-profile';
import { createTimelineExportPlan } from './timeline-export-plan';

const file = new File(['media'], 'source.mp4', { type: 'video/mp4' });
const profile = createTimelineExportProfile({
  filename: 'Launch Cut Lab.mp4',
  projectMetadata: getDefaultProjectMetadata(),
  resolutionId: '1080p',
});

describe('timeline export planning', () => {
  it('builds a content-range plan from ready timeline clips', () => {
    const source = createSource({ id: 'source-video', kind: 'video' });
    const state = createState([
      createTrack('track-v1', 'visual', [createClip('clip-v1', source.id, 1, 5)]),
      createTrack('track-a1', 'audio', [createClip('clip-a1', source.id, 1, 5)]),
    ]);

    const result = createTimelineExportPlan({ profile, sources: [source], state });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.durationSeconds).toBe(5);
      expect(result.plan.videoSegments).toHaveLength(1);
      expect(result.plan.audioSegments).toHaveLength(1);
      expect(result.plan.profile.frameRate).toBe(30);
    }
  });

  it('caps export duration to the project duration', () => {
    const source = createSource({ id: 'source-video', kind: 'video' });
    const state = createState(
      [createTrack('track-v1', 'visual', [createClip('clip-v1', source.id, 0, 12)])],
      8
    );

    const result = createTimelineExportPlan({ profile, sources: [source], state });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.durationSeconds).toBe(8);
    }
  });

  it('rejects missing visual content and missing sources', () => {
    const state = createState([
      createTrack('track-v1', 'visual', [createClip('clip-v1', 'missing-source', 0, 4)]),
    ]);

    const result = createTimelineExportPlan({ profile, sources: [], state });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.message)).toContain(
        'Missing source for clip "clip-v1".'
      );
      expect(result.issues.map((issue) => issue.message)).toContain(
        'Add at least one visual clip to export.'
      );
    }
  });

  it('rejects overlapping clips for simple export', () => {
    const source = createSource({ id: 'source-video', kind: 'video' });
    const state = createState([
      createTrack('track-v1', 'visual', [
        createClip('clip-a', source.id, 0, 4),
        createClip('clip-b', source.id, 2, 5),
      ]),
    ]);

    const result = createTimelineExportPlan({ profile, sources: [source], state });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.message)).toContain(
        'Overlapping video clips are not supported by simple export yet.'
      );
    }
  });

  it('normalizes export filenames', () => {
    expect(normalizeExportFilename('  Launch/Cut Lab!!.mp4  ')).toBe('Launch-Cut Lab.mp4');
    expect(normalizeExportFilename('  ')).toBe('timeline-export.mp4');
  });

  it('uses project video settings for the default export profile', () => {
    const projectMetadata = {
      ...getDefaultProjectMetadata(),
      frameRate: 24,
      height: 2160,
      width: 3840,
    };
    const projectProfile = createTimelineExportProfile({
      filename: 'Project Resolution.mp4',
      projectMetadata,
      resolutionId: 'project',
    });

    expect(projectProfile.frameRate).toBe(24);
    expect(projectProfile.resolution).toMatchObject({
      height: 2160,
      id: 'project',
      width: 3840,
    });
    expect(
      getTimelineExportResolutionOptions(projectMetadata).map((resolution) => resolution.id)
    ).toEqual(['project', '720p', '1080p', '4k']);
  });
});

function createState(
  tracks: readonly Track<EditorTrackKind>[],
  durationSeconds = 36
): TimelineState {
  return {
    clipDropFeedback: {
      activeClipId: null,
      activeTargetTrackId: null,
      hoveredTrackId: null,
      penetrationRatio: 0,
      reason: null,
      sourceTrackId: null,
      valid: false,
    },
    clipGroups: [],
    contentRevision: 0,
    duration: fromSeconds(durationSeconds),
    markers: [],
    playheadTime: fromSeconds(0),
    scrollLeft: 0,
    scrollTop: 0,
    snapEnabled: true,
    snapFeedback: {
      lines: [],
      target: null,
    },
    snapThresholdPixels: 8,
    tracks: [...tracks],
    zoomScale: 80,
  };
}

function createTrack(
  id: string,
  kind: EditorTrackKind,
  clips: readonly Clip[]
): Track<EditorTrackKind> {
  return {
    clips: [...clips],
    id,
    kind,
    locked: false,
    muted: false,
    name: id,
    selected: false,
    targeted: true,
    visible: true,
  };
}

function createClip(id: string, sourceId: string, startSeconds: number, endSeconds: number): Clip {
  return {
    id,
    label: id,
    selected: false,
    sourceId,
    sourceStart: fromSeconds(0),
    timelineEnd: fromSeconds(endSeconds),
    timelineStart: fromSeconds(startSeconds),
  };
}

function createSource(options: { id: string; kind: 'audio' | 'image' | 'video' }): SourceBinSource {
  const metadata =
    options.kind === 'audio'
      ? {
          durationSeconds: 10,
          hasAudio: true,
          hasVideo: false,
        }
      : {
          durationSeconds: 10,
          hasAudio: options.kind === 'video',
          hasVideo: true,
          height: 1080,
          width: 1920,
        };

  return {
    file,
    id: options.id,
    kind: options.kind,
    metadata,
    mimeType: options.kind === 'audio' ? 'audio/mp4' : 'video/mp4',
    name: options.id,
    originalPath: `source-library/assets/${options.id}/original`,
    posterFile: null,
    sizeBytes: file.size,
    status: 'ready',
    thumbnailUrl: null,
  };
}
