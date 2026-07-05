import { Boxes, Clapperboard, FolderKanban } from 'lucide-react';
import { ClipInspectorPanel } from '@/components/panels/ClipInspectorPanel';
import { ExportToolPanel } from '@/components/panels/ExportPanel';
import { ProjectPanel } from '@/components/panels/ProjectPanel';
import { SourceBinPanel } from '@/components/source-bin/SourceBinPanel';
import { useSourceBin } from '@/components/source-bin/source-bin-context';
import { ToolPanel } from '@/components/panels/ToolPanel';

export function ToolPanelStack() {
  const { sources } = useSourceBin();

  return (
    <aside className="tool-panel-stack" aria-label="Editor tool panels">
      <div className="tool-panel-stack-header">
        <span>Inspector</span>
        <span>Full editor lab</span>
      </div>
      <ToolPanel icon={<FolderKanban aria-hidden="true" />} title="Project">
        <ProjectPanel />
      </ToolPanel>
      <ExportToolPanel />
      <ToolPanel
        badge={sources.length.toString()}
        contentClassName="source-bin-tool-panel-content"
        icon={<Boxes aria-hidden="true" />}
        title="Source Bin"
      >
        <SourceBinPanel />
      </ToolPanel>
      <ToolPanel icon={<Clapperboard aria-hidden="true" />} title="Clip Inspector">
        <ClipInspectorPanel />
      </ToolPanel>
    </aside>
  );
}
