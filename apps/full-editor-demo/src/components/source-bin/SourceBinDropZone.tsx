import { useState, type ReactNode } from 'react';
import { cn } from '#full-editor/lib/cn';

interface SourceBinDropZoneProps {
  children: ReactNode;
  disabled?: boolean;
  onImportFiles: (files: FileList) => void;
}

export function SourceBinDropZone({
  children,
  disabled = false,
  onImportFiles,
}: SourceBinDropZoneProps) {
  const [draggingFiles, setDraggingFiles] = useState(false);

  return (
    <div
      className={cn('source-bin-drop-zone', draggingFiles && 'is-dragging')}
      onDragEnter={(event) => {
        if (disabled || !hasDraggedFiles(event.dataTransfer)) {
          return;
        }

        event.preventDefault();
        setDraggingFiles(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDraggingFiles(false);
        }
      }}
      onDragOver={(event) => {
        if (disabled || !hasDraggedFiles(event.dataTransfer)) {
          return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
        if (disabled) {
          return;
        }

        event.preventDefault();
        setDraggingFiles(false);

        if (event.dataTransfer.files.length > 0) {
          onImportFiles(event.dataTransfer.files);
        }
      }}
    >
      {children}
      {draggingFiles ? <div className="source-bin-drop-indicator">Drop to import</div> : null}
    </div>
  );
}

function hasDraggedFiles(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.items).some((item) => item.kind === 'file');
}
