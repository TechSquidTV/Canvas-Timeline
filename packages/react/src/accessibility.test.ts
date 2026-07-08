import { describe, expect, it } from 'vite-plus/test';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import type { Clip, Track } from '@techsquidtv/canvas-timeline-core';
import {
  formatTimelineRangeValue,
  formatTimelineTimeValue,
  getClipAccessibleDescription,
  getClipAccessibleName,
} from './accessibility';

function createClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'clip-1',
    sourceId: 'source-1',
    timelineStart: fromSeconds(6.5),
    timelineEnd: fromSeconds(12.5),
    sourceStart: fromSeconds(0),
    selected: false,
    label: 'Main feature clip',
    ...overrides,
  };
}

function createTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'video-a',
    kind: 'visual',
    selected: false,
    locked: false,
    muted: false,
    visible: true,
    clips: [],
    name: 'Video A',
    ...overrides,
  };
}

describe('timeline accessibility utilities', () => {
  it('formats time values without raw floating point artifacts', () => {
    expect(formatTimelineTimeValue(14.478260869565213)).toBe('14.48 seconds');
    expect(formatTimelineTimeValue(fromSeconds(1))).toBe('1 second');
    expect(formatTimelineTimeValue(fromSeconds(65.25))).toBe('1 minute, 5.25 seconds');
  });

  it('formats ranges with optional duration', () => {
    expect(formatTimelineRangeValue(fromSeconds(1), fromSeconds(5))).toBe('1 second to 5 seconds');
    expect(
      formatTimelineRangeValue(fromSeconds(1), fromSeconds(5), { includeDuration: true })
    ).toBe('1 second to 5 seconds, duration 4 seconds');
  });

  it('builds concise clip names and descriptions from timeline state snapshots', () => {
    const track = createTrack({ locked: true });
    const clip = createClip({ selected: true, resizable: false });

    expect(getClipAccessibleName(clip, track)).toBe('Main feature clip on Video A');
    expect(getClipAccessibleDescription(clip, track)).toBe(
      'starts at 6.5 seconds, ends at 12.5 seconds, duration 6 seconds, track locked, selected, trimming disabled'
    );
  });
});
