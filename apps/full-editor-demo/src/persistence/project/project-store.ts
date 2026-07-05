import type { TimelineState } from '@techsquidtv/canvas-timeline-core';
import {
  getAppStorageRoot,
  getDirectoryFromPath,
  removeEntryIfExists,
  writeBlobToPath,
} from '../opfs/files';
import { createMutationQueue } from '../opfs/mutation-queue';
import { isNotFoundError } from '../opfs/support';
import { getDefaultProjectMetadata, type ProjectMetadata } from '../../project/project-metadata';
import { parseProjectSnapshot } from './project-snapshot-schema';
import { sanitizeTimelineState } from './timeline-state-persistence';
import type { PersistedTimelineState, ProjectStorageSnapshot } from './types';

const PROJECT_DIRECTORY = 'project';
const PROJECT_FILE = 'project.json';

const projectQueue = createMutationQueue();

export async function loadProjectSnapshot(): Promise<ProjectStorageSnapshot | null> {
  const root = await getProjectRoot();

  try {
    const fileHandle = await root.getFileHandle(PROJECT_FILE);
    const file = await fileHandle.getFile();
    return parseProjectSnapshot(await file.text());
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

export async function saveProjectSnapshot(state: TimelineState) {
  await savePersistedProjectState(sanitizeTimelineState(state));
}

export async function savePersistedProjectState(
  timelineState: PersistedTimelineState,
  metadata: ProjectMetadata = getDefaultProjectMetadata()
) {
  const snapshot: ProjectStorageSnapshot = {
    version: 3,
    projectId: metadata.projectId,
    title: metadata.title,
    description: metadata.description,
    frameRate: metadata.frameRate,
    height: metadata.height,
    width: metadata.width,
    savedAt: new Date().toISOString(),
    timelineState,
  };

  await projectQueue.run(async () => {
    const root = await getProjectRoot();
    await writeBlobToPath(
      root,
      PROJECT_FILE,
      new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
    );
  });
}

export async function resetProjectSnapshot() {
  await projectQueue.run(async () => {
    const root = await getProjectRoot();
    await removeEntryIfExists(root, PROJECT_FILE);
  });
}

async function getProjectRoot() {
  const root = await getAppStorageRoot();
  return getDirectoryFromPath(root, [PROJECT_DIRECTORY], true);
}
