import { useTimelineRulerTicks, useTimelineViewport } from '#react/hooks';
import { wrapper } from '#react/hooks/integration/testHelpers';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { act, renderHook } from '@testing-library/react';
import { expect, test } from 'vite-plus/test';

test('viewport and ruler preserve measured zero width through collapse and resize', () => {
  const engine = new TimelineEngine({ duration: fromSeconds(30), zoomScale: 100, tracks: [] });
  const { result } = renderHook(
    () => ({
      viewport: useTimelineViewport(),
      ruler: useTimelineRulerTicks(),
      override: useTimelineRulerTicks({ format: 'seconds', viewportWidth: 200 }),
    }),
    { wrapper: (props) => wrapper({ ...props, engine }) }
  );
  expect(result.current.viewport.viewportWidth).toBe(1000);
  act(() => {
    engine.setViewportWidth(0);
  });
  expect(result.current.viewport.viewportWidth).toBe(0);
  expect(result.current.viewport.viewportDurationSeconds).toBe(0);
  expect(result.current.viewport.visibleEndSeconds).toBe(
    result.current.viewport.visibleStartSeconds
  );
  expect(result.current.ruler).toHaveLength(1);
  expect(result.current.ruler[0].x).toBe(0);
  expect(result.current.override.at(-1)?.x).toBe(200);

  act(() => {
    engine.setViewportWidth(200);
  });
  expect(result.current.viewport.viewportWidth).toBe(200);
  expect(result.current.viewport.viewportDurationSeconds).toBe(2);
  expect(result.current.ruler.at(-1)?.x).toBe(200);
  act(() => {
    engine.setViewportWidth(0);
  });
  expect(result.current.viewport.viewportWidth).toBe(0);
  expect(result.current.ruler).toHaveLength(1);
});
