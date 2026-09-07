import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vite-plus/test';
import { useTimelineEngine } from '@techsquidtv/canvas-timeline-react';
import { App } from '#full-editor/app/App';
import { loadEditorBootstrap } from '#full-editor/app/bootstrap/loadEditorBootstrap';
import { getDefaultProjectMetadata } from '#full-editor/features/project/project-metadata';

vi.mock('#full-editor/app/bootstrap/loadEditorBootstrap', () => ({ loadEditorBootstrap: vi.fn() }));
vi.mock('#full-editor/features/project/ProjectAutosave', () => ({ ProjectAutosave: () => null }));
vi.mock('#full-editor/features/project/ProjectProvider', () => ({
  ProjectProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('#full-editor/features/source-bin/SourceBinProvider', () => ({
  SourceBinProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('#full-editor/features/media/MediaSyncProvider', () => ({
  MediaSyncProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('#full-editor/features/timeline/TimelineDropModeProvider', () => ({
  TimelineDropModeProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('#full-editor/app/shell/EditorShell', () => ({
  EditorShell: () => {
    const state = useTimelineEngine().getState();
    return (
      <output data-testid="range">
        {state.inPoint?.v ?? 'missing'}:{state.outPoint?.v ?? 'missing'}
      </output>
    );
  },
}));

test('restoring a saved project preserves its In/Out points', async () => {
  vi.mocked(loadEditorBootstrap).mockResolvedValue({
    projectMetadata: getDefaultProjectMetadata(),
    projectState: {
      tracks: [],
      clipGroups: [],
      markers: [],
      duration: { v: 10, r: 1 },
      inPoint: { v: 2, r: 1 },
      outPoint: { v: 8, r: 1 },
      playheadTime: { v: 0, r: 1 },
      scrollLeft: 0,
      scrollTop: 0,
      zoomScale: 100,
      snapEnabled: true,
      snapThresholdPixels: 10,
    },
    sources: [],
    storageAvailable: false,
  });
  render(<App />);
  expect((await screen.findByTestId('range')).textContent).toBe('2:8');
});
