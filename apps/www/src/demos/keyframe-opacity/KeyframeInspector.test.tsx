import { KeyframeInspector } from '#www/demos/keyframe-opacity/KeyframeInspector';
import { opacityKeyframeProperty } from '#www/demos/keyframe-opacity/keyframe-opacity-utils';
import { demoTracks, opacityClipId } from '#www/demos/keyframe-opacity/timeline-demo-data';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { TimelineProvider } from '@techsquidtv/canvas-timeline-react';
import { toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { fireEvent, render } from '@testing-library/react';
import { expect, it } from 'vite-plus/test';

function setup() {
  const engine = new TimelineEngine({
    tracks: demoTracks,
    keyframeProperties: [opacityKeyframeProperty],
  });
  engine.keyframes.selectKeyframes([{ clipId: opacityClipId, keyframeId: 'opacity-kf-1' }]);
  return {
    engine,
    ...render(
      <TimelineProvider engine={engine}>
        <KeyframeInspector />
      </TimelineProvider>
    ),
  };
}

it('previews slider changes, commits once, and cancels without another history entry', () => {
  const { engine, getByRole } = setup();
  const slider = getByRole('slider', { name: 'Opacity' });
  fireEvent.change(slider, { target: { value: '0.6' } });
  fireEvent.change(slider, { target: { value: '0.7' } });
  expect(engine.getState().tracks[0].clips[0].keyframes?.[1].value).toBe(0.28);
  expect(engine.keyframes.getClipKeyframes(opacityClipId)[1].value).toBe(0.7);
  fireEvent.pointerUp(slider);
  expect(engine.getState().tracks[0].clips[0].keyframes?.[1].value).toBe(0.7);
  fireEvent.click(getByRole('button', { name: 'Undo' }));
  expect(engine.keyframes.getClipKeyframes(opacityClipId)[1].value).toBe(0.28);
  expect(engine.canUndo).toBe(false);
  fireEvent.change(slider, { target: { value: '0.5' } });
  fireEvent.keyDown(slider, { key: 'Escape' });
  expect(engine.keyframes.getClipKeyframes(opacityClipId)[1].value).toBe(0.28);
  expect(engine.canUndo).toBe(false);
});

it('edits exact timecode, rejects collisions, and changes the lane height', () => {
  const { engine, getByRole, getByLabelText } = setup();
  fireEvent.change(getByLabelText('Keyframe timecode'), { target: { value: '00:00:06:15' } });
  fireEvent.blur(getByLabelText('Keyframe timecode'));
  expect(toSeconds(engine.keyframes.getClipKeyframes(opacityClipId)[1].time)).toBe(6.5);
  fireEvent.change(getByLabelText('Keyframe timecode'), { target: { value: '00:00:10:00' } });
  fireEvent.blur(getByLabelText('Keyframe timecode'));
  expect(toSeconds(engine.keyframes.getClipKeyframes(opacityClipId)[1].time)).toBe(6.5);
  expect(getByRole('status').textContent).toContain('already exists');
  fireEvent.click(getByRole('button', { name: 'Expand curve lane' }));
  expect(engine.tracks[0].height).toBe(240);
  fireEvent.click(getByRole('button', { name: 'Collapse curve lane' }));
  expect(engine.tracks[0].height).toBe(64);
});
