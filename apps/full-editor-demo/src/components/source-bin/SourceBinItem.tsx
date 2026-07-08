import type { DragEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '#full-editor/components/ui/button';
import { formatSeconds } from '#full-editor/lib/timeline-format';
import { cn } from '#full-editor/lib/cn';
import { formatFrameRate } from '#full-editor/lib/media-format';
import { writeSourceBinDragPayload } from '#full-editor/timeline/source-drag-payload';
import { SourceThumbnail } from '#full-editor/components/source-bin/SourceThumbnail';
import type { SourceBinSource } from '#full-editor/components/source-bin/types';

interface SourceBinItemProps {
  onDragEnd: (sourceId: string) => void;
  onDragStart: (sourceId: string) => void;
  onRemove: (sourceId: string) => void;
  onSelect: (sourceId: string) => void;
  selected: boolean;
  source: SourceBinSource;
  usageCount: number;
  warningMessage?: string;
}

export function SourceBinItem({
  onDragEnd,
  onDragStart,
  onRemove,
  onSelect,
  selected,
  source,
  usageCount,
  warningMessage,
}: SourceBinItemProps) {
  const draggable = source.status === 'ready';

  return (
    <div
      className={cn(
        'source-bin-item',
        draggable && 'is-draggable',
        selected && 'is-selected',
        source.status === 'failed' && 'is-failed'
      )}
      draggable={draggable}
      onDragEnd={() => onDragEnd(source.id)}
      onDragStart={(event) => handleDragStart(event, source, onDragStart)}
    >
      <button className="source-bin-item-main" onClick={() => onSelect(source.id)} type="button">
        <SourceThumbnail source={source} />
        <span className="source-bin-copy">
          <span className="source-bin-name">{source.name}</span>
          <span className="source-bin-detail">{getSourceDetail(source)}</span>
          {source.status === 'failed' ? (
            <span className="source-bin-error">{source.errorMessage ?? 'Import failed.'}</span>
          ) : null}
          {usageCount > 0 ? (
            <span className="source-bin-usage">{`${usageCount} timeline ${
              usageCount === 1 ? 'clip' : 'clips'
            }`}</span>
          ) : null}
          {warningMessage !== undefined ? (
            <span className="source-bin-warning">{warningMessage}</span>
          ) : null}
        </span>
      </button>
      <Button
        aria-label={`Remove ${source.name}`}
        className="source-bin-remove-button"
        iconOnly
        onClick={() => onRemove(source.id)}
        variant="ghost"
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  );
}

function handleDragStart(
  event: DragEvent<HTMLDivElement>,
  source: SourceBinSource,
  onDragStart: (sourceId: string) => void
) {
  if (source.status !== 'ready') {
    event.preventDefault();
    return;
  }

  onDragStart(source.id);
  writeSourceBinDragPayload(event.dataTransfer, source.id);
}

function getSourceDetail(source: SourceBinSource) {
  if (source.status === 'failed') {
    return `${source.kind} · Failed · ${formatFileSize(source.sizeBytes)}`;
  }

  const parts: string[] = [source.kind];
  if (source.metadata.durationSeconds !== undefined) {
    parts.push(formatSeconds(source.metadata.durationSeconds));
  }
  if (source.metadata.width !== undefined && source.metadata.height !== undefined) {
    parts.push(`${source.metadata.width}x${source.metadata.height}`);
  }
  if (source.metadata.averageFrameRate !== undefined) {
    parts.push(`${formatFrameRate(source.metadata.averageFrameRate)} fps`);
  }
  parts.push(formatFileSize(source.sizeBytes));

  return parts.join(' · ');
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const sizeKilobytes = sizeBytes / 1024;
  if (sizeKilobytes < 1024) {
    return `${sizeKilobytes.toFixed(1)} KB`;
  }

  return `${(sizeKilobytes / 1024).toFixed(1)} MB`;
}
