import type { Clip, Marker, TimelineState, Track } from '@techsquidtv/canvas-timeline-core';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import {
  getAppStorageRoot,
  getDirectoryFromPath,
  removeEntryIfExists,
  writeBlobToPath,
} from '@/persistence/opfs/files';
import { createMutationQueue } from '@/persistence/opfs/mutation-queue';
import { isNotFoundError } from '@/persistence/opfs/support';
import { demoProject, type EditorTrackKind } from '@/data/demo-project';
import type { PersistedTimelineState, ProjectStorageSnapshot } from './types';

const PROJECT_DIRECTORY = 'project';
const PROJECT_FILE = 'project.json';

const projectQueue = createMutationQueue();

interface JsonObject {
  readonly [key: string]: unknown;
}

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
    version: 1,
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

export function sanitizeTimelineState(state: TimelineState): PersistedTimelineState {
  return {
    duration: cloneOptionalRationalTime(state.duration),
    inPoint: cloneOptionalRationalTime(state.inPoint),
    markers: (state.markers ?? []).map(cloneMarker),
    outPoint: cloneOptionalRationalTime(state.outPoint),
    playheadTime: cloneRationalTime(state.playheadTime),
    scrollLeft: state.scrollLeft,
    scrollTop: state.scrollTop,
    snapEnabled: state.snapEnabled,
    snapThresholdPixels: state.snapThresholdPixels,
    tracks: state.tracks.map(cloneTrack),
    zoomScale: state.zoomScale,
  };
}

function parseProjectSnapshot(text: string): ProjectStorageSnapshot | null {
  const parsed: unknown = JSON.parse(text);
  return isProjectSnapshot(parsed) ? parsed : null;
}

async function getProjectRoot() {
  const root = await getAppStorageRoot();
  return getDirectoryFromPath(root, [PROJECT_DIRECTORY], true);
}

function cloneTrack(track: Track): Track<EditorTrackKind> {
  return {
    ...track,
    kind: track.kind as EditorTrackKind,
    clips: track.clips.map(cloneClip),
  };
}

function cloneClip(clip: Clip): Clip {
  const { editPreview: _editPreview, ...rest } = clip;

  return {
    ...rest,
    sourceStart: cloneRationalTime(clip.sourceStart),
    timelineEnd: cloneRationalTime(clip.timelineEnd),
    timelineStart: cloneRationalTime(clip.timelineStart),
    keyframes: clip.keyframes?.map((keyframe) => ({
      ...keyframe,
      time: cloneRationalTime(keyframe.time),
    })),
    metadata: clip.metadata === undefined ? undefined : { ...clip.metadata },
  };
}

function cloneMarker(marker: Marker): Marker {
  return {
    ...marker,
    time: cloneRationalTime(marker.time),
  };
}

function cloneOptionalRationalTime(time: RationalTime | undefined) {
  return time === undefined ? undefined : cloneRationalTime(time);
}

function cloneRationalTime(time: RationalTime): RationalTime {
  return { v: time.v, r: time.r };
}

function isProjectSnapshot(value: unknown): value is ProjectStorageSnapshot {
  if (!isJsonObject(value)) {
    return false;
  }

  return (
    value.version === 1 &&
    typeof value.projectId === 'string' &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    typeof value.frameRate === 'number' &&
    typeof value.savedAt === 'string' &&
    isPersistedTimelineState(value.timelineState)
  );
}

function isPersistedTimelineState(value: unknown): value is PersistedTimelineState {
  if (!isJsonObject(value)) {
    return false;
  }

  return (
    (value.duration === undefined || isRationalTime(value.duration)) &&
    (value.inPoint === undefined || isRationalTime(value.inPoint)) &&
    Array.isArray(value.markers) &&
    value.markers.every(isMarker) &&
    (value.outPoint === undefined || isRationalTime(value.outPoint)) &&
    isRationalTime(value.playheadTime) &&
    typeof value.scrollLeft === 'number' &&
    typeof value.scrollTop === 'number' &&
    typeof value.snapEnabled === 'boolean' &&
    typeof value.snapThresholdPixels === 'number' &&
    Array.isArray(value.tracks) &&
    value.tracks.every(isTrack) &&
    typeof value.zoomScale === 'number'
  );
}

function isTrack(value: unknown): value is Track<EditorTrackKind> {
  if (!isJsonObject(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    (value.kind === 'audio' || value.kind === 'visual') &&
    Array.isArray(value.clips) &&
    value.clips.every(isClip) &&
    typeof value.selected === 'boolean' &&
    typeof value.locked === 'boolean' &&
    typeof value.muted === 'boolean' &&
    typeof value.visible === 'boolean'
  );
}

function isClip(value: unknown): value is Clip {
  if (!isJsonObject(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.sourceId === 'string' &&
    isRationalTime(value.timelineStart) &&
    isRationalTime(value.timelineEnd) &&
    isRationalTime(value.sourceStart) &&
    typeof value.selected === 'boolean'
  );
}

function isMarker(value: unknown): value is Marker {
  if (!isJsonObject(value)) {
    return false;
  }

  return typeof value.id === 'string' && isRationalTime(value.time);
}

function isRationalTime(value: unknown): value is RationalTime {
  return (
    isJsonObject(value) &&
    typeof value.v === 'number' &&
    typeof value.r === 'number' &&
    Number.isFinite(value.v) &&
    Number.isFinite(value.r) &&
    value.r > 0
  );
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
