import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { demoProject, timelineMarkers, timelineTracks } from '@/data/demo-project';
import { mediaLibraryStore } from '@/media/library/media-library-store';
import type { MediaLibrarySource } from '@/media/library/media-library-types';
import { errorMessage, hasOpfsSupport } from '@/persistence/opfs/support';
import { loadProjectSnapshot } from '@/persistence/project/project-store';
import type { PersistedTimelineState } from '@/persistence/project/types';

export interface EditorBootstrapState {
  projectState: PersistedTimelineState;
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
      sources: [],
      storageAvailable,
    };
  }

  let projectState = seedProjectState;
  let sources: readonly MediaLibrarySource[] = [];
  let sourceRestoreError: string | undefined;

  try {
    projectState = (await loadProjectSnapshot())?.timelineState ?? seedProjectState;
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
    sourceRestoreError,
    sources,
    storageAvailable,
  };
}

function createSeedProjectState(): PersistedTimelineState {
  return {
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
