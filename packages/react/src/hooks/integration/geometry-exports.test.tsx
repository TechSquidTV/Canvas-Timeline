import * as ReactPackage from '@techsquidtv/canvas-timeline-react';
import * as ReactHooks from '@techsquidtv/canvas-timeline-react/hooks';
import { wrapper, createTrack } from '#react/hooks/integration/testHelpers';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { act, renderHook } from '@testing-library/react';
import { expect, test } from 'vite-plus/test';

test('geometry hooks are available through both public React entrypoints and stay reactive', () => {
  for (const entrypoint of [ReactPackage, ReactHooks]) {
    expect(entrypoint.useTimelineViewportBounds).toBe(ReactHooks.useTimelineViewportBounds);
    expect(entrypoint.useTimelineTrackGeometry).toBe(ReactHooks.useTimelineTrackGeometry);
  }
  const engine = new TimelineEngine({
    duration: fromSeconds(30),
    tracks: [createTrack('track', [])],
  });
  engine.setViewportWidth(200);
  const { result } = renderHook(
    () => ({
      bounds: ReactHooks.useTimelineViewportBounds(),
      rect: ReactHooks.useTimelineTrackGeometry('track', {}),
    }),
    { wrapper: (props) => wrapper({ ...props, engine }) }
  );
  expect(toSeconds(result.current.bounds.maxContentTime)).toBe(30);
  expect(result.current.rect?.width).toBe(200);
  act(() => {
    engine.setViewportWidth(400);
  });
  expect(result.current.bounds.maxScrollLeft).toBe(engine.maxScrollLeft);
  expect(result.current.rect?.width).toBe(400);
  act(() => {
    engine.setTrackHeight('track', 80);
  });
  expect(result.current.rect?.height).toBe(80);
  act(() => {
    engine.removeTrack('track');
  });
  expect(result.current.rect).toBeNull();
});
