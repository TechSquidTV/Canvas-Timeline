import { render, screen } from '@testing-library/react';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { TimelineProvider } from '@techsquidtv/canvas-timeline-react';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { expect, test } from 'vite-plus/test';
import { CutSelectedClipButton } from '#full-editor/features/timeline/CutSelectedClipButton';

test('CutSelectedClipButton reacts to the current playhead position', () => {
  const engine = new TimelineEngine({
    duration: fromSeconds(10),
    playheadTime: fromSeconds(0),
    tracks: [
      {
        clips: [
          {
            id: 'clip-selected',
            selected: true,
            sourceId: 'source-video',
            sourceStart: fromSeconds(0),
            timelineEnd: fromSeconds(6),
            timelineStart: fromSeconds(2),
          },
        ],
        id: 'track-v1',
        kind: 'visual',
        locked: false,
        muted: false,
        name: 'V1',
        selected: false,
        targeted: true,
        visible: true,
      },
    ],
  });
  const renderButton = (playheadSeconds: number) => (
    <TimelineProvider engine={engine}>
      <CutSelectedClipButton playheadSeconds={playheadSeconds} />
    </TimelineProvider>
  );
  const { rerender } = render(renderButton(0));
  const button = screen.getByRole<HTMLButtonElement>('button', {
    name: 'Cut selected clip at playhead',
  });

  expect(button.disabled).toBe(true);

  rerender(renderButton(4));
  expect(button.disabled).toBe(false);

  rerender(renderButton(6));
  expect(button.disabled).toBe(true);
});
