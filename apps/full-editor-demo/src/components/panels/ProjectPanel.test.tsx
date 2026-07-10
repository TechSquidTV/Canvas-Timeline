import { act, fireEvent, render, screen } from '@testing-library/react';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { TimelineProvider } from '@techsquidtv/canvas-timeline-react';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { expect, test, vi } from 'vite-plus/test';
import { ProjectPanel } from '#full-editor/components/panels/ProjectPanel';
import {
  ProjectContext,
  type ProjectContextValue,
} from '#full-editor/editor/project/project-context';
import { getDefaultProjectMetadata } from '#full-editor/project/project-metadata';
import { defaultEditorRulerFormat } from '#full-editor/timeline/ruler-format';

function renderProjectPanel(overrides: Partial<ProjectContextValue> = {}) {
  const engine = new TimelineEngine({
    duration: fromSeconds(10),
    playheadTime: fromSeconds(0),
    tracks: [],
  });
  const context = {
    autosaveStatus: 'saved',
    metadata: getDefaultProjectMetadata(),
    resetProject: vi.fn(),
    rulerFormat: defaultEditorRulerFormat,
    setProjectFrameRatePreset: vi.fn(),
    setProjectResolutionPreset: vi.fn(),
    setProjectTitle: vi.fn(),
    setRulerFormat: vi.fn(),
    storageAvailable: true,
    ...overrides,
  } satisfies ProjectContextValue;

  render(
    <TimelineProvider engine={engine}>
      <ProjectContext.Provider value={context}>
        <ProjectPanel />
      </ProjectContext.Provider>
    </TimelineProvider>
  );
  return context;
}

test('ProjectPanel applies an edited project frame rate', () => {
  const context = renderProjectPanel();

  fireEvent.change(screen.getByLabelText('Frame rate'), { target: { value: '24' } });
  act(() => {
    screen.getByRole('button', { name: 'Apply' }).click();
  });

  expect(context.setProjectFrameRatePreset).toHaveBeenCalledWith('24');
});

test('ProjectPanel cancels a frame-rate draft without applying it', () => {
  const context = renderProjectPanel();
  const frameRateSelect = screen.getByLabelText<HTMLSelectElement>('Frame rate');

  fireEvent.change(frameRateSelect, { target: { value: '59.94' } });
  expect(frameRateSelect.value).toBe('59.94');
  act(() => {
    screen.getByRole('button', { name: 'Cancel' }).click();
  });

  expect(frameRateSelect.value).toBe('30');
  expect(context.setProjectFrameRatePreset).not.toHaveBeenCalled();
});

test('ProjectPanel does not reapply or pause for an unchanged frame rate', () => {
  const context = renderProjectPanel();

  fireEvent.change(screen.getByLabelText('Project name'), {
    target: { value: 'Renamed Project' },
  });
  act(() => {
    screen.getByRole('button', { name: 'Apply' }).click();
  });

  expect(context.setProjectTitle).toHaveBeenCalledWith('Renamed Project');
  expect(context.setProjectFrameRatePreset).not.toHaveBeenCalled();
});

test('ProjectPanel applies an edited ruler format', () => {
  const context = renderProjectPanel();

  fireEvent.change(screen.getByLabelText('Ruler format'), { target: { value: 'timecode' } });
  act(() => {
    screen.getByRole('button', { name: 'Apply' }).click();
  });

  expect(context.setRulerFormat).toHaveBeenCalledWith('timecode');
});

test('ProjectPanel cancels a ruler-format draft without applying it', () => {
  const context = renderProjectPanel();
  const rulerFormatSelect = screen.getByLabelText<HTMLSelectElement>('Ruler format');

  fireEvent.change(rulerFormatSelect, { target: { value: 'frame-number' } });
  expect(rulerFormatSelect.value).toBe('frame-number');
  act(() => {
    screen.getByRole('button', { name: 'Cancel' }).click();
  });

  expect(rulerFormatSelect.value).toBe('seconds');
  expect(context.setRulerFormat).not.toHaveBeenCalled();
});
