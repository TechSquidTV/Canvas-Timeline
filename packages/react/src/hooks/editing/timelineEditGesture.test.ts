import { TimelineEditGesture } from '#react/hooks/editing/timelineEditGesture';
import { createClip, createTrack } from '#react/hooks/integration/testHelpers';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { afterEach, expect, test, vi } from 'vite-plus/test';

afterEach(() => vi.restoreAllMocks());

test.each([
  new Error('commit failed'),
  new TypeError('invalid commit'),
  new RangeError('invalid range'),
])('a throwing commit clears its preview and releases ownership: %s', (error) => {
  const engine = new TimelineEngine({ tracks: [createTrack('track', [createClip('clip', 0, 2)])] });
  const gesture = new TimelineEditGesture(engine);
  gesture.publish({ type: 'delete-clips', clipIds: ['clip'] });
  expect(engine.getEditPreview()).not.toBeNull();
  expect(gesture.isCurrent()).toBe(true);
  vi.spyOn(engine, 'commitEdit').mockImplementation(() => {
    throw error;
  });
  expect(() => gesture.commit()).toThrow(error);
  expect(engine.getEditPreview()).toBeNull();
  expect(gesture.isCurrent()).toBe(false);
  expect(engine.tracks[0].clips).toHaveLength(1);
  expect(engine.canUndo).toBe(false);
});
