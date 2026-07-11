import { fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { beforeEach, expect, test, vi } from 'vite-plus/test';

vi.mock('#full-editor/features/media/PreviewMonitor', () => ({
  PreviewMonitor: function PreviewMonitor() {
    return <canvas aria-label="Program workspace" />;
  },
}));

vi.mock('#full-editor/app/shell/TimelineDock', () => ({
  TimelineDock: function TimelineDock() {
    return <div>Timeline workspace</div>;
  },
}));

vi.mock('#full-editor/app/shell/ToolPanelStack', () => ({
  ToolPanelStack: function ToolPanelStack() {
    const [draftCount, setDraftCount] = useState(0);
    return (
      <div>
        Inspector workspace
        <button onClick={() => setDraftCount((count) => count + 1)} type="button">
          Draft {draftCount}
        </button>
      </div>
    );
  },
}));

vi.mock('#full-editor/app/shell/TopMenuBar', () => ({
  TopMenuBar: function TopMenuBar() {
    return <div>Editor menu</div>;
  },
}));

vi.mock('#full-editor/shared/ui/resizable', () => ({
  ResizableHandle: function ResizableHandle() {
    return <div />;
  },
  ResizablePanel: function ResizablePanel({ children }: { children?: ReactNode }) {
    return <div>{children}</div>;
  },
  ResizablePanelGroup: function ResizablePanelGroup({ children }: { children?: ReactNode }) {
    return <div>{children}</div>;
  },
}));

import { EditorShell } from '#full-editor/app/shell/EditorShell';

beforeEach(() => {
  setCompactViewport(false);
});

test('EditorShell renders the resizable desktop workspace at supported widths', () => {
  render(<EditorShell />);

  expect(screen.getByLabelText('Program workspace')).not.toBeNull();
  expect(screen.getByText('Timeline workspace')).not.toBeNull();
  expect(screen.getByText('Inspector workspace')).not.toBeNull();
  expect(screen.queryByRole('tablist')).toBeNull();
});

test('EditorShell exposes compact workspaces as accessible tabs', () => {
  setCompactViewport(true);
  render(<EditorShell />);

  const timelineTab = screen.getByRole('tab', { name: 'Timeline' });
  expect(timelineTab.getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('tabpanel').textContent).toContain('Timeline workspace');
  expect(document.getElementById('compact-editor-panel-timeline')).not.toBeNull();
  expect(document.getElementById('compact-editor-panel-program')).not.toBeNull();
  expect(document.getElementById('compact-editor-panel-inspector')).not.toBeNull();
  expect(screen.getByLabelText('Program workspace')).not.toBeNull();

  fireEvent.click(screen.getByRole('tab', { name: 'Program' }));

  expect(screen.getByRole('tab', { name: 'Program' }).getAttribute('aria-selected')).toBe('true');
  expect(document.getElementById('compact-editor-panel-program')?.hidden).toBe(false);
  expect(screen.getByLabelText('Program workspace')).not.toBeNull();

  fireEvent.keyDown(screen.getByRole('tab', { name: 'Program' }), { key: 'ArrowRight' });

  const inspectorTab = screen.getByRole('tab', { name: 'Inspector' });
  expect(inspectorTab.getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(inspectorTab);
  expect(screen.getByRole('tabpanel').textContent).toContain('Inspector workspace');

  fireEvent.click(screen.getByRole('button', { name: 'Draft 0' }));
  fireEvent.click(timelineTab);
  fireEvent.click(inspectorTab);

  expect(screen.getByRole('button', { name: 'Draft 1' })).not.toBeNull();
});

function setCompactViewport(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches,
      media: '(max-width: 47.999rem)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    })),
  });
}
