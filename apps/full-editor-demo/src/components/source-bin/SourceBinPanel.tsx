import { useRef } from 'react';
import { SourceBinDropZone } from './SourceBinDropZone';
import { SourceBinList } from './SourceBinList';
import { useSourceBin } from './source-bin-context';

const acceptedSourceTypes = 'video/*,audio/*,image/*,video/x-matroska,video/mp2t,.ts,audio/aac';

export function SourceBinPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    importFiles,
    importing,
    removeSource,
    selectSource,
    selectedSourceId,
    sources,
    storageAvailable,
  } = useSourceBin();

  return (
    <div className="source-bin-panel">
      <div className="source-bin-toolbar">
        <span className="source-bin-toolbar-title">Sources</span>
        <span className="source-bin-toolbar-count">
          {sources.length === 1 ? '1 item' : `${sources.length} items`}
        </span>
        <button
          className="source-bin-import-action"
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
              onRemoveSource={(sourceId) => {
                void removeSource(sourceId);
              }}
              onSelectSource={selectSource}
              selectedSourceId={selectedSourceId}
              sources={sources}
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
