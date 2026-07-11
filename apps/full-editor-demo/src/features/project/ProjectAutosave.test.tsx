import { render, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vite-plus/test';
import { ProjectAutosave } from '#full-editor/features/project/ProjectAutosave';
import { getDefaultProjectMetadata } from '#full-editor/features/project/project-metadata';

const { savePersistedProjectState } = vi.hoisted(() => ({
  savePersistedProjectState: vi.fn(),
}));

vi.mock('#full-editor/infrastructure/persistence/project/project-store', () => ({
  savePersistedProjectState,
}));

vi.mock('#full-editor/features/project/usePersistableTimelineSnapshot', () => ({
  usePersistableTimelineSnapshot: () => ({
    fingerprint: 'seed-project',
    timelineState: {
      clipGroups: [],
      markers: [],
      playheadTime: { r: 60_000, v: 0 },
      scrollLeft: 0,
      scrollTop: 0,
      snapEnabled: true,
      snapThresholdPixels: 10,
      tracks: [],
      zoomScale: 38,
    },
  }),
}));

test('ProjectAutosave remains read-only after project restore failure', async () => {
  const onStatusChange = vi.fn();

  render(
    <ProjectAutosave
      disabledStatus="error"
      enabled={false}
      metadata={getDefaultProjectMetadata()}
      onStatusChange={onStatusChange}
    />
  );

  await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('error'));
  expect(savePersistedProjectState).not.toHaveBeenCalled();
});
