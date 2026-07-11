import { Boxes, Clapperboard, FolderKanban } from 'lucide-react';
import { ClipInspectorPanel } from '#full-editor/features/inspector/ClipInspectorPanel';
import { ProjectPanel } from '#full-editor/features/project/ProjectPanel';
import { SourceBinPanel } from '#full-editor/features/source-bin/SourceBinPanel';
import { useSourceBin } from '#full-editor/features/source-bin/source-bin-context';
import { ToolPanel } from '#full-editor/app/shell/ToolPanel';

export function ToolPanelStack() {
  const { sources } = useSourceBin();

  return (
    <aside className="tool-panel-stack" aria-label="Editor tool panels">
      <div className="tool-panel-stack-header">
        <span>Inspector</span>
      </div>
      <ToolPanel defaultOpen={false} icon={<FolderKanban aria-hidden="true" />} title="Project">
        <ProjectPanel />
      </ToolPanel>
      <ToolPanel
        badge={sources.length.toString()}
        contentClassName="source-bin-tool-panel-content"
        icon={<Boxes aria-hidden="true" />}
        title="Source Bin"
      >
        <SourceBinPanel />
      </ToolPanel>
      <ToolPanel
        defaultOpen={false}
        icon={<Clapperboard aria-hidden="true" />}
        title="Clip Inspector"
      >
        <ClipInspectorPanel />
      </ToolPanel>
    </aside>
  );
}
