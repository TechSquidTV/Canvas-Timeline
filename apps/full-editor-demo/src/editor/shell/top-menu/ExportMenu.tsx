import { ExportPanel } from '#full-editor/components/panels/ExportPanel';
import type { TimelineExportStatus } from '#full-editor/export/timeline-export-types';

interface ExportMenuProps {
  onStatusChange: (status: TimelineExportStatus) => void;
  status: TimelineExportStatus;
}

export function ExportMenu({ onStatusChange, status }: ExportMenuProps) {
  return (
    <div className="editor-menu-popover editor-export-menu">
      <ExportPanel status={status} onStatusChange={onStatusChange} />
    </div>
  );
}
