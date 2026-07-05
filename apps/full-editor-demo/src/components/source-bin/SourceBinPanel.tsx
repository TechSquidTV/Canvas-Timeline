import { useMemo, useRef } from 'react';
import { useTimelineTracks } from '@techsquidtv/canvas-timeline-react';
import type { EditorTrackKind } from '@/data/demo-project';
import { countTimelineSourceUsage } from '@/timeline/source-usage';
import { SourceBinDropZone } from './SourceBinDropZone';
import { SourceBinList } from './SourceBinList';
import { useSourceBin } from './source-bin-context';

const acceptedSourceTypes = 'video/*,audio/*,image/*,video/x-matroska,video/mp2t,.ts,audio/aac';

export function SourceBinPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { tracks } = useTimelineTracks<EditorTrackKind>();
  const {
    clearSourceActionMessage,
    endSourceDrag,
    importFiles,
    importing,
    removeSource,
    selectSource,
    sourceActionMessage,
    selectedSourceId,
    setSourceActionMessage,
    sources,
    startSourceDrag,
    storageAvailable,
  } = useSourceBin();
  const sourceUsageCounts = useMemo(() => countTimelineSourceUsage(tracks), [tracks]);
  const actionMessageBySourceId = useMemo(
    () =>
      sourceActionMessage === null
        ? new Map<string, string>()
        : new Map([[sourceActionMessage.sourceId, sourceActionMessage.message]]),
    [sourceActionMessage]
  );

  return (
    <div className="source-bin-panel">
      <div className="source-bin-toolbar">
        <span className="source-bin-toolbar-title">Sources</span>
        <span className="source-bin-toolbar-count">
          {sources.length === 1 ? '1 item' : `${sources.length} items`}
        </span>
        <button
          className="editor-toolbar-action source-bin-import-action"
          disabled={!storageAvailable || importing}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          {importing ? 'Importing' : 'Import'}
        </button>
        <input
          ref={inputRef}
          accept={acceptedSourceTypes}
          className="source-bin-file-input"
          disabled={!storageAvailable || importing}
          multiple
          onChange={(event) => {
            if (event.currentTarget.files !== null) {
              void importFiles(event.currentTarget.files);
            }
            event.currentTarget.value = '';
          }}
          type="file"
        />
      </div>
      <SourceBinDropZone
        disabled={!storageAvailable || importing}
        onImportFiles={(files) => {
          void importFiles(files);
        }}
      >
        {storageAvailable ? (
          sources.length === 0 ? (
            <p className="panel-empty">
              Import video, audio, or image files to build the source bin.
            </p>
          ) : (
            <SourceBinList
              actionMessageBySourceId={actionMessageBySourceId}
              onEndSourceDrag={endSourceDrag}
              onRemoveSource={(sourceId) => {
                void removeSource(sourceId);
              }}
              onSelectSource={(sourceId) => {
                clearSourceActionMessage(sourceId);
                selectSource(sourceId);
              }}
              onStartSourceDrag={startSourceDrag}
              selectedSourceId={selectedSourceId}
              sources={sources}
              usageCounts={sourceUsageCounts}
              onRequestBlockedRemove={(sourceId, usageCount) => {
                setSourceActionMessage({
                  sourceId,
                  message: `Used by ${usageCount} timeline ${
                    usageCount === 1 ? 'clip' : 'clips'
                  }. Remove those clips before deleting the source.`,
                });
              }}
            />
          )
        ) : (
          <p className="panel-empty">
            Local browser storage is unavailable, so imported media cannot be stored for this demo.
          </p>
        )}
      </SourceBinDropZone>
    </div>
  );
}
