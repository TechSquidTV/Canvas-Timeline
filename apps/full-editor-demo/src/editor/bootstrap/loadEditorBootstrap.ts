import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { demoProject, timelineMarkers, timelineTracks } from '@/data/demo-project';
import { mediaLibraryStore } from '@/media/library/media-library-store';
import type { MediaLibrarySource } from '@/media/library/media-library-types';
import { errorMessage, hasOpfsSupport } from '@/persistence/opfs/support';
import { loadProjectSnapshot } from '@/persistence/project/project-store';
import { getDefaultProjectMetadata, type ProjectMetadata } from '@/project/project-metadata';
import type { PersistedTimelineState } from '@/persistence/project/types';

export interface EditorBootstrapState {
  projectState: PersistedTimelineState;
  projectMetadata: ProjectMetadata;
  sourceRestoreError?: string;
  sources: readonly MediaLibrarySource[];
  storageAvailable: boolean;
}

export async function loadEditorBootstrap(): Promise<EditorBootstrapState> {
  const storageAvailable = hasOpfsSupport();
  const seedProjectState = createSeedProjectState();

  if (!storageAvailable) {
    return {
      projectState: seedProjectState,
      projectMetadata: getDefaultProjectMetadata(),
      sources: [],
      storageAvailable,
    };
  }

  let projectState = seedProjectState;
  let projectMetadata = getDefaultProjectMetadata();
  let sources: readonly MediaLibrarySource[] = [];
  let sourceRestoreError: string | undefined;

  try {
    const snapshot = await loadProjectSnapshot();
    projectState = snapshot?.timelineState ?? seedProjectState;
    projectMetadata =
      snapshot === null
        ? projectMetadata
        : {
            description: snapshot.description,
            frameRate: snapshot.frameRate,
            height: snapshot.height,
            projectId: snapshot.projectId,
            title: snapshot.title,
            width: snapshot.width,
          };
  } catch {
    projectState = seedProjectState;
  }

  try {
    sources = await mediaLibraryStore.load();
  } catch (error) {
    sourceRestoreError = errorMessage(error);
  }

  return {
    projectState,
    projectMetadata,
    sourceRestoreError,
    sources,
    storageAvailable,
  };
}

function createSeedProjectState(): PersistedTimelineState {
  return {
    clipGroups: [],
    duration: fromSeconds(demoProject.durationSeconds),
    markers: timelineMarkers,
    playheadTime: fromSeconds(0),
    scrollLeft: 0,
    scrollTop: 0,
    snapEnabled: true,
    snapThresholdPixels: 10,
    tracks: timelineTracks,
    zoomScale: 38,
  };
}
