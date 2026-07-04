import { act, render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vite-plus/test';
import { TimelineEngine, type Track } from '@techsquidtv/canvas-timeline-core';
import { TimelineProvider } from '../../Provider';
import { expectDefined } from '../../../../../test-utils/assertions';
import { TrackItem } from './TrackItem';
import { TrackList } from './TrackList';

function createTracks(count: number): Track[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `track-${index + 1}`,
    kind: 'visual',
    clips: [],
    selected: false,
    locked: false,
    muted: false,
    visible: true,
  }));
}

describe('TrackList', () => {
  it('translates row content with live vertical scroll', () => {
    const engine = new TimelineEngine({ tracks: createTracks(4) });
    engine.setViewportHeight(96);
    engine.setScrollTop(24);

    const { container } = render(
      <TimelineProvider engine={engine}>
        <TrackList>
          {engine.tracks.map((track) => (
            <TrackItem key={track.id} trackId={track.id} />
          ))}
        </TrackList>
      </TimelineProvider>
    );

    const content = expectDefined(
      container.querySelector('.timeline-track-list-content') as HTMLElement | null,
      'track list content'
    );

    expect(content.style.transform).toBe('translateY(-24px)');

    act(() => {
      engine.setScrollTop(48);
    });

    expect(content.style.transform).toBe('translateY(-48px)');
  });
});
