import { SourceBinItem } from '#full-editor/components/source-bin/SourceBinItem';
import type { SourceBinSource } from '#full-editor/components/source-bin/types';

interface SourceBinListProps {
  actionMessageBySourceId: ReadonlyMap<string, string>;
  onEndSourceDrag: (sourceId: string) => void;
  onRemoveSource: (sourceId: string) => void;
  onRequestBlockedRemove: (sourceId: string, usageCount: number) => void;
  onSelectSource: (sourceId: string) => void;
  onStartSourceDrag: (sourceId: string) => void;
  selectedSourceId: string | null;
  sources: readonly SourceBinSource[];
  usageCounts: ReadonlyMap<string, number>;
}

export function SourceBinList({
  actionMessageBySourceId,
  onEndSourceDrag,
  onRemoveSource,
  onRequestBlockedRemove,
  onSelectSource,
  onStartSourceDrag,
  selectedSourceId,
  sources,
  usageCounts,
}: SourceBinListProps) {
  return (
    <div className="source-bin-list">
      {sources.map((source) => {
        const usageCount = usageCounts.get(source.id) ?? 0;

        return (
          <SourceBinItem
            key={source.id}
            onDragEnd={onEndSourceDrag}
            onDragStart={onStartSourceDrag}
            onRemove={(sourceId) => {
              if (usageCount > 0) {
                onRequestBlockedRemove(sourceId, usageCount);
                return;
              }
              onRemoveSource(sourceId);
            }}
            onSelect={onSelectSource}
            selected={source.id === selectedSourceId}
            source={source}
            usageCount={usageCount}
            warningMessage={actionMessageBySourceId.get(source.id)}
          />
        );
      })}
    </div>
  );
}
