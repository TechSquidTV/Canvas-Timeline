import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { describe, expect, it } from 'vite-plus/test';
import { getDefaultProjectMetadata } from '#full-editor/project/project-metadata';
import { parseProjectSnapshot } from '#full-editor/persistence/project/project-snapshot-schema';
import type { ProjectStorageSnapshot } from '#full-editor/persistence/project/types';

describe('project snapshot schema', () => {
  it('parses version 3 project snapshots with video settings', () => {
    const snapshot = createSnapshot();
    const parsed = parseProjectSnapshot(JSON.stringify(snapshot));

    expect(parsed).not.toBeNull();
    expect(parsed?.width).toBe(1920);
    expect(parsed?.height).toBe(1080);
  });

  it('rejects older project snapshot versions', () => {
    const snapshot = createSnapshot();
    const parsed = parseProjectSnapshot(
      JSON.stringify({
        ...snapshot,
        version: 2,
      })
    );

    expect(parsed).toBeNull();
  });

  it('restores supported fractional rates and rejects unsupported project rates', () => {
    expect(
      parseProjectSnapshot(JSON.stringify({ ...createSnapshot(), frameRate: 30_000 / 1_001 }))
        ?.frameRate
    ).toBe(30_000 / 1_001);
    expect(parseProjectSnapshot(JSON.stringify({ ...createSnapshot(), frameRate: 48 }))).toBeNull();
  });

  it('defaults project metadata to a 1080p canvas', () => {
    expect(getDefaultProjectMetadata()).toMatchObject({
      frameRate: 30,
      height: 1080,
      width: 1920,
    });
  });
});

function createSnapshot(): ProjectStorageSnapshot {
  return {
    description: 'Test project',
    frameRate: 30,
    height: 1080,
    projectId: 'test-project',
    savedAt: '2026-07-05T00:00:00.000Z',
    timelineState: {
      clipGroups: [],
      duration: fromSeconds(36),
      markers: [],
      playheadTime: fromSeconds(0),
      scrollLeft: 0,
      scrollTop: 0,
      snapEnabled: true,
      snapThresholdPixels: 10,
      tracks: [],
      zoomScale: 38,
    },
    title: 'Test Project',
    version: 3,
    width: 1920,
  };
}
