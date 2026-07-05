import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { TimelineProvider } from '@techsquidtv/canvas-timeline-react';
import { useEffect, useMemo, useState } from 'react';
import { ProjectAutosave } from './editor/autosave/ProjectAutosave';
import {
  loadEditorBootstrap,
  type EditorBootstrapState,
} from './editor/bootstrap/loadEditorBootstrap';
import { EditorShell } from './editor/shell/EditorShell';
import { MediaSyncProvider } from './editor/shell/MediaSyncProvider';
import { SourceBinProvider } from './components/source-bin/SourceBinProvider';

export function App() {
  const [bootstrapState, setBootstrapState] = useState<EditorBootstrapState | null>(null);

  useEffect(() => {
    let cancelled = false;

    void loadEditorBootstrap().then((nextBootstrapState) => {
      if (!cancelled) {
        setBootstrapState(nextBootstrapState);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (bootstrapState === null) {
    return <div className="full-editor-loading">Loading editor storage...</div>;
  }

  return <LoadedEditor bootstrapState={bootstrapState} />;
}

function LoadedEditor({ bootstrapState }: { bootstrapState: EditorBootstrapState }) {
  const engine = useMemo(
    () =>
      new TimelineEngine({
        duration: bootstrapState.projectState.duration,
        markers: bootstrapState.projectState.markers,
        playheadTime: bootstrapState.projectState.playheadTime,
        scrollLeft: bootstrapState.projectState.scrollLeft,
        scrollTop: bootstrapState.projectState.scrollTop,
        snapEnabled: bootstrapState.projectState.snapEnabled,
        snapThresholdPixels: bootstrapState.projectState.snapThresholdPixels,
        tracks: bootstrapState.projectState.tracks,
        zoomScale: bootstrapState.projectState.zoomScale,
      }),
    [bootstrapState.projectState]
  );

  return (
    <TimelineProvider engine={engine}>
      <ProjectAutosave enabled={bootstrapState.storageAvailable} />
      <SourceBinProvider
        initialSources={bootstrapState.sources}
        restoreError={bootstrapState.sourceRestoreError}
        storageAvailable={bootstrapState.storageAvailable}
      >
        <MediaSyncProvider>
          <EditorShell />
        </MediaSyncProvider>
      </SourceBinProvider>
    </TimelineProvider>
  );
}
