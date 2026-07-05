import { PreviewMonitor } from './PreviewMonitor';
import { TimelineDock } from './TimelineDock';
import { ToolPanelStack } from './ToolPanelStack';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

export function EditorShell() {
  return (
    <main className="full-editor-app">
      <ResizablePanelGroup
        className="full-editor-layout"
        orientation="vertical"
        resizeTargetMinimumSize={{ coarse: 28, fine: 8 }}
      >
        <ResizablePanel
          className="editor-shell-panel editor-top-panel"
          defaultSize="66%"
          minSize="18rem"
        >
          <ResizablePanelGroup
            className="full-editor-top-row"
            orientation="horizontal"
            resizeTargetMinimumSize={{ coarse: 28, fine: 8 }}
          >
            <ResizablePanel
              className="editor-shell-panel editor-monitor-panel"
              defaultSize="68%"
              minSize="24rem"
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
