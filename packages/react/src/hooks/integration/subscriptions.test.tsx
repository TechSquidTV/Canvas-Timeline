import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { expect, test } from 'vite-plus/test';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { TimelineProvider } from '#react/Provider';
import { useTimelinePlayback } from '#react/hooks/playback/useTimelinePlayback';
import { useTimelineSnapping } from '#react/hooks/editing/useTimelineSnapping';
import { useTimelineMarkers } from '#react/hooks/markers/useTimelineMarkers';
import { useTimelineClips } from '#react/hooks/clips/useTimelineClips';
import { createClip, createTrack } from '#react/hooks/integration/testHelpers';
test('playback and clip consumers ignore viewport changes while their own state remains reactive', () => {
  const engine = new TimelineEngine({
    duration: fromSeconds(100),
    tracks: [createTrack('track', [createClip('clip', 0, 5)])],
  });
  engine.setInPoint(fromSeconds(1));
  engine.setOutPoint(fromSeconds(10));
  engine.addMarker(fromSeconds(2));
  let renders = 0;
  const { result } = renderHook(
    () => {
      renders++;
      return {
        playback: useTimelinePlayback(),
        clips: useTimelineClips(),
        snapping: useTimelineSnapping(),
        markers: useTimelineMarkers(),
      };
    },
    { wrapper: ({ children }) => <TimelineProvider engine={engine}>{children}</TimelineProvider> }
  );
  const initialRenders = renders;
  const clips = result.current.clips.clips;
  for (let index = 1; index <= 10; index++) {
    act(() => engine.setScrollLeft(index * 10));
  }
  expect(renders).toBe(initialRenders);
  expect(result.current.clips.clips).toBe(clips);
  act(() => engine.setPlaybackRate(2));
  expect(result.current.playback.playbackRate).toBe(2);
  act(() => {
    engine.updateClipProperties('clip', { label: 'updated' });
  });
  expect(result.current.clips.clips[0].clip.label).toBe('updated');
});
