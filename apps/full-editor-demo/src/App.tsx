import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { TimelineProvider } from '@techsquidtv/canvas-timeline-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProjectAutosave } from './editor/autosave/ProjectAutosave';
import {
  loadEditorBootstrap,
  type EditorBootstrapState,
} from './editor/bootstrap/loadEditorBootstrap';
import { ProjectProvider } from './editor/project/ProjectProvider';
import type { ProjectAutosaveStatus } from './editor/project/project-context';
import { EditorShell } from './editor/shell/EditorShell';
import { MediaSyncProvider } from './editor/shell/MediaSyncProvider';
import { SourceBinProvider } from './components/source-bin/SourceBinProvider';
import { mediaLibraryStore } from './media/library/media-library-store';
import {
  resetProjectSnapshot,
  savePersistedProjectState,
} from './persistence/project/project-store';
import type { ProjectMetadata, ProjectMetadataOverride } from './project/project-metadata';
import { findVideoResolutionPreset, type VideoResolutionPresetId } from './project/video-settings';
import { TimelineDropModeProvider } from './timeline/TimelineDropModeProvider';

export function App() {
  const [bootstrapState, setBootstrapState] = useState<EditorBootstrapState | null>(null);
  const [editorKey, setEditorKey] = useState(0);

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

  const resetEditorProject = useCallback(async (metadataOverride?: ProjectMetadataOverride) => {
    setBootstrapState(null);
    let resetError: unknown;

    try {
      await resetProjectSnapshot();
      await mediaLibraryStore.clear();
    } catch (error) {
      resetError = error;
    }

    const nextBootstrapState = await loadEditorBootstrap();
    const nextProjectMetadata = {
      ...nextBootstrapState.projectMetadata,
      ...metadataOverride,
    };

    if (nextBootstrapState.storageAvailable) {
      try {
        await savePersistedProjectState(nextBootstrapState.projectState, nextProjectMetadata);
      } catch (error) {
        if (resetError === undefined) {
          resetError = error;
        }
      }
    }

    setBootstrapState({
      ...nextBootstrapState,
      projectMetadata: nextProjectMetadata,
    });
    setEditorKey((currentKey) => currentKey + 1);

    if (resetError !== undefined) {
      throw resetError;
    }
  }, []);

  if (bootstrapState === null) {
    return <div className="full-editor-loading">Loading editor storage...</div>;
  }

  return (
    <LoadedEditor
      key={editorKey}
      bootstrapState={bootstrapState}
      resetEditorProject={resetEditorProject}
    />
  );
}

function LoadedEditor({
  bootstrapState,
  resetEditorProject,
}: {
  bootstrapState: EditorBootstrapState;
  resetEditorProject: (metadataOverride?: ProjectMetadataOverride) => Promise<void>;
}) {
  const [autosaveStatus, setAutosaveStatus] = useState<ProjectAutosaveStatus>(
    bootstrapState.storageAvailable ? 'saved' : 'unavailable'
  );
  const [projectMetadata, setProjectMetadata] = useState<ProjectMetadata>(
    bootstrapState.projectMetadata
  );
  const engine = useMemo(
    () =>
      new TimelineEngine({
        clipGroups: bootstrapState.projectState.clipGroups,
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
  const setProjectTitle = useCallback((title: string) => {
    setProjectMetadata((currentMetadata) => ({
      ...currentMetadata,
      title,
    }));
  }, []);
  const setProjectResolutionPreset = useCallback((presetId: VideoResolutionPresetId) => {
    const preset = findVideoResolutionPreset(presetId);
    setProjectMetadata((currentMetadata) => ({
      ...currentMetadata,
      height: preset.height,
      width: preset.width,
    }));
  }, []);

  return (
    <TimelineProvider engine={engine}>
      <ProjectProvider
        autosaveStatus={autosaveStatus}
        metadata={projectMetadata}
        resetProject={resetEditorProject}
        setProjectResolutionPreset={setProjectResolutionPreset}
        setProjectTitle={setProjectTitle}
        storageAvailable={bootstrapState.storageAvailable}
      >
        <ProjectAutosave
          enabled={bootstrapState.storageAvailable}
          metadata={projectMetadata}
          onStatusChange={setAutosaveStatus}
        />
        <SourceBinProvider
          initialSources={bootstrapState.sources}
          restoreError={bootstrapState.sourceRestoreError}
          storageAvailable={bootstrapState.storageAvailable}
        >
          <MediaSyncProvider>
            <TimelineDropModeProvider>
              <EditorShell />
            </TimelineDropModeProvider>
          </MediaSyncProvider>
        </SourceBinProvider>
      </ProjectProvider>
    </TimelineProvider>
  );
}
