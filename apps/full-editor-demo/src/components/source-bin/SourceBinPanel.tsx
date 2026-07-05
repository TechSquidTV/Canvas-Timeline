import { SourceBinDropZone } from './SourceBinDropZone';
import { SourceBinList } from './SourceBinList';
import { SourceImportButton } from './SourceImportButton';
import { useSourceBin } from './source-bin-context';

export function SourceBinPanel() {
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
        <SourceImportButton
          disabled={!storageAvailable}
          importing={importing}
          onImportFiles={(files) => {
            void importFiles(files);
          }}
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
