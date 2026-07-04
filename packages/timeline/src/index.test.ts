import { expect, test } from 'vite-plus/test';
import { TimelineEngine } from './core';
import { TimelineProvider } from './react';
import { CanvasRenderer } from './renderer';
import { fromSeconds } from './utils';
import * as htmlMedia from './html-media';
import * as timeline from './index';

test('timeline package re-exports the public composition surface', () => {
  expect(timeline.TimelineEngine).toBe(TimelineEngine);
  expect(timeline.TimelineProvider).toBe(TimelineProvider);
  expect(timeline.CanvasRenderer).toBe(CanvasRenderer);
  expect(timeline.fromSeconds).toBe(fromSeconds);
  expect(htmlMedia.createHTMLMediaAdapter).toBeTypeOf('function');
});
