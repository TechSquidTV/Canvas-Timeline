import type { TimelineState } from '@techsquidtv/canvas-timeline-core';
import {
  getAppStorageRoot,
  getDirectoryFromPath,
  removeEntryIfExists,
  writeBlobToPath,
} from '@/persistence/opfs/files';
import { createMutationQueue } from '@/persistence/opfs/mutation-queue';
import { isNotFoundError } from '@/persistence/opfs/support';
import { demoProject } from '@/data/demo-project';
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

export async function savePersistedProjectState(timelineState: PersistedTimelineState) {
  const snapshot: ProjectStorageSnapshot = {
    version: 2,
    projectId: demoProject.id,
    title: demoProject.title,
    description: demoProject.description,
    frameRate: demoProject.frameRate,
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
