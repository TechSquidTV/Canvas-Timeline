import type { Marker, TimelineClipGroup, Track } from '@techsquidtv/canvas-timeline-core';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import type { EditorTrackKind } from '#full-editor/data/demo-project';
import type { ProjectMetadata } from '#full-editor/project/project-metadata';

export interface PersistedTimelineState {
  clipGroups: TimelineClipGroup[];
  duration?: RationalTime;
  inPoint?: RationalTime;
  markers: Marker[];
  outPoint?: RationalTime;
  playheadTime: RationalTime;
  scrollLeft: number;
  scrollTop: number;
  snapEnabled: boolean;
  snapThresholdPixels: number;
  tracks: Track<EditorTrackKind>[];
  zoomScale: number;
}

export interface ProjectStorageSnapshot extends ProjectMetadata {
  savedAt: string;
  timelineState: PersistedTimelineState;
  version: 3;
}
