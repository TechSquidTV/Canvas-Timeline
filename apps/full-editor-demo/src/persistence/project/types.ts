import type { Marker, TimelineClipGroup, Track } from '@techsquidtv/canvas-timeline-core';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import type { EditorTrackKind } from '@/data/demo-project';

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

export interface ProjectStorageSnapshot {
  description: string;
  frameRate: number;
  projectId: string;
  savedAt: string;
  timelineState: PersistedTimelineState;
  title: string;
  version: 2;
}
