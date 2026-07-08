import { expect, test } from 'vite-plus/test';
import { TimelineEngine } from '#timeline/core';
import { TimelineProvider } from '#timeline/react';
import { CanvasRenderer } from '#timeline/renderer';
import { fromSeconds } from '#timeline/utils';
import * as htmlMedia from '#timeline/html-media';
import * as timeline from '#timeline/index';

test('timeline package re-exports the public composition surface', () => {
  expect(timeline.TimelineEngine).toBe(TimelineEngine);
  expect(timeline.TimelineProvider).toBe(TimelineProvider);
  expect(timeline.CanvasRenderer).toBe(CanvasRenderer);
  expect(timeline.fromSeconds).toBe(fromSeconds);
  expect(htmlMedia.createHTMLMediaAdapter).toBeTypeOf('function');
});
