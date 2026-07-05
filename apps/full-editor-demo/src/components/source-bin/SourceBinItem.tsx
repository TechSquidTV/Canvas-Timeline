import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatSeconds } from '@/lib/timeline-format';
import { cn } from '@/lib/cn';
import { SourceThumbnail } from './SourceThumbnail';
import type { SourceBinSource } from './types';

interface SourceBinItemProps {
  onRemove: (sourceId: string) => void;
  onSelect: (sourceId: string) => void;
  selected: boolean;
  source: SourceBinSource;
}

export function SourceBinItem({ onRemove, onSelect, selected, source }: SourceBinItemProps) {
  return (
    <div
      className={cn(
        'source-bin-item',
        selected && 'is-selected',
        source.status === 'failed' && 'is-failed'
      )}
    >
      <button className="source-bin-item-main" onClick={() => onSelect(source.id)} type="button">
        <SourceThumbnail source={source} />
        <span className="source-bin-copy">
          <span>{source.name}</span>
          <span>{getSourceDetail(source)}</span>
          {source.status === 'failed' ? (
            <span>{source.errorMessage ?? 'Import failed.'}</span>
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
