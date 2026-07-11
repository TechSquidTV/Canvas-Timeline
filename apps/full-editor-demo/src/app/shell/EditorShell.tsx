import { useEffect, useState } from 'react';
import { PreviewMonitor } from '#full-editor/features/media/PreviewMonitor';
import { TimelineDock } from '#full-editor/app/shell/TimelineDock';
import { ToolPanelStack } from '#full-editor/app/shell/ToolPanelStack';
import { TopMenuBar } from '#full-editor/app/shell/TopMenuBar';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '#full-editor/shared/ui/resizable';

export function EditorShell() {
  const compact = useCompactEditorLayout();

  return compact ? <CompactEditorShell /> : <DesktopEditorShell />;
}

function DesktopEditorShell() {
  return (
    <main className="full-editor-app">
      <TopMenuBar />
      <ResizablePanelGroup
        className="full-editor-layout"
        orientation="vertical"
        resizeTargetMinimumSize={{ coarse: 44, fine: 8 }}
      >
        <ResizablePanel
          className="editor-shell-panel editor-top-panel"
          defaultSize="66%"
          minSize="18rem"
        >
          <ResizablePanelGroup
            className="full-editor-top-row"
            orientation="horizontal"
            resizeTargetMinimumSize={{ coarse: 44, fine: 8 }}
          >
            <ResizablePanel
              className="editor-shell-panel editor-monitor-panel"
              defaultSize="68%"
              minSize="24rem"
              style={{ overflow: 'hidden' }}
            >
              <PreviewMonitor />
            </ResizablePanel>
            <ResizableHandle aria-label="Resize inspector" withHandle />
            <ResizablePanel
              className="editor-shell-panel editor-inspector-panel"
              defaultSize="32%"
              minSize="19rem"
            >
              <ToolPanelStack />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize timeline" withHandle />
        <ResizablePanel
          className="editor-shell-panel editor-timeline-shell-panel"
          defaultSize="34%"
          minSize="14rem"
        >
          <TimelineDock />
        </ResizablePanel>
      </ResizablePanelGroup>
    </main>
  );
}

type CompactEditorView = 'inspector' | 'program' | 'timeline';

const compactEditorViews = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'program', label: 'Program' },
  { id: 'inspector', label: 'Inspector' },
] as const satisfies readonly { id: CompactEditorView; label: string }[];

function CompactEditorShell() {
  const [activeView, setActiveView] = useState<CompactEditorView>('timeline');

  return (
    <main className="full-editor-app full-editor-app-compact">
      <TopMenuBar />
      <div className="compact-editor-workspace">
        <div aria-label="Editor workspace" className="compact-editor-tabs" role="tablist">
          {compactEditorViews.map((view) => (
            <button
              aria-controls={`compact-editor-panel-${view.id}`}
              aria-selected={activeView === view.id}
              className="editor-button editor-button-ghost compact-editor-tab"
              id={`compact-editor-tab-${view.id}`}
              key={view.id}
              onClick={() => setActiveView(view.id)}
              onKeyDown={(event) => {
                const nextView = getNextCompactEditorView(view.id, event.key);
                if (nextView !== null) {
                  event.preventDefault();
                  setActiveView(nextView);
                  document.getElementById(`compact-editor-tab-${nextView}`)?.focus();
                }
              }}
              role="tab"
              tabIndex={activeView === view.id ? 0 : -1}
              type="button"
            >
              {view.label}
            </button>
          ))}
        </div>
        {compactEditorViews.map((view) => (
          <section
            aria-labelledby={`compact-editor-tab-${view.id}`}
            className="compact-editor-panel"
            hidden={activeView !== view.id}
            id={`compact-editor-panel-${view.id}`}
            key={view.id}
            role="tabpanel"
          >
            {view.id === 'timeline' ? <TimelineDock compact /> : null}
            {view.id === 'program' ? <PreviewMonitor /> : null}
            {view.id === 'inspector' ? <ToolPanelStack /> : null}
          </section>
        ))}
      </div>
    </main>
  );
}

function useCompactEditorLayout() {
  const [compact, setCompact] = useState(() => matchCompactEditorLayout());

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }

    const query = window.matchMedia('(max-width: 47.999rem)');
    const update = () => setCompact(query.matches);
    query.addEventListener('change', update);
    update();
    return () => query.removeEventListener('change', update);
  }, []);

  return compact;
}

function matchCompactEditorLayout() {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width: 47.999rem)').matches
    : false;
}

function getNextCompactEditorView(
  currentView: CompactEditorView,
  key: string
): CompactEditorView | null {
  const currentIndex = compactEditorViews.findIndex((view) => view.id === currentView);
  switch (key) {
    case 'ArrowLeft':
      return compactEditorViews[
        (currentIndex - 1 + compactEditorViews.length) % compactEditorViews.length
      ].id;
    case 'ArrowRight':
      return compactEditorViews[(currentIndex + 1) % compactEditorViews.length].id;
    case 'Home':
      return compactEditorViews[0].id;
    case 'End':
      return compactEditorViews[compactEditorViews.length - 1].id;
    default:
      return null;
  }
}
