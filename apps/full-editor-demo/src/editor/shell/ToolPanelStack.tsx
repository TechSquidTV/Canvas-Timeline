import { Boxes, Clapperboard, FolderKanban } from 'lucide-react';
import { ClipInspectorPanel } from '#full-editor/components/panels/ClipInspectorPanel';
import { ProjectPanel } from '#full-editor/components/panels/ProjectPanel';
import { SourceBinPanel } from '#full-editor/components/source-bin/SourceBinPanel';
import { useSourceBin } from '#full-editor/components/source-bin/source-bin-context';
import { ToolPanel } from '#full-editor/components/panels/ToolPanel';

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
