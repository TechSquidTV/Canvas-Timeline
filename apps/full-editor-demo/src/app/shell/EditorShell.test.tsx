import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, expect, test, vi } from 'vite-plus/test';

vi.mock('#full-editor/features/media/PreviewMonitor', () => ({
  PreviewMonitor: function PreviewMonitor() {
    return <div>Program workspace</div>;
  },
}));

vi.mock('#full-editor/app/shell/TimelineDock', () => ({
  TimelineDock: function TimelineDock() {
    return <div>Timeline workspace</div>;
  },
}));

vi.mock('#full-editor/app/shell/ToolPanelStack', () => ({
  ToolPanelStack: function ToolPanelStack() {
    return <div>Inspector workspace</div>;
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

  expect(screen.getByText('Program workspace')).not.toBeNull();
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

  fireEvent.click(screen.getByRole('tab', { name: 'Program' }));

  expect(screen.getByRole('tab', { name: 'Program' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('tabpanel').textContent).toContain('Program workspace');

  fireEvent.keyDown(screen.getByRole('tab', { name: 'Program' }), { key: 'ArrowRight' });

  const inspectorTab = screen.getByRole('tab', { name: 'Inspector' });
  expect(inspectorTab.getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(inspectorTab);
  expect(screen.getByRole('tabpanel').textContent).toContain('Inspector workspace');
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
