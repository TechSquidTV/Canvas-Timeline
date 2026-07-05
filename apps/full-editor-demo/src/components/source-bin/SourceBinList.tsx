import { SourceBinItem } from './SourceBinItem';
import type { SourceBinSource } from './types';

interface SourceBinListProps {
  onRemoveSource: (sourceId: string) => void;
  onSelectSource: (sourceId: string) => void;
  selectedSourceId: string | null;
  sources: readonly SourceBinSource[];
}

export function SourceBinList({
  onRemoveSource,
  onSelectSource,
  selectedSourceId,
  sources,
}: SourceBinListProps) {
  return (
    <div className="source-bin-list">
      {sources.map((source) => (
        <SourceBinItem
          key={source.id}
          onRemove={onRemoveSource}
          onSelect={onSelectSource}
          selected={source.id === selectedSourceId}
          source={source}
        />
      ))}
    </div>
  );
}
