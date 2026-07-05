import type { Marker, Track } from '@techsquidtv/canvas-timeline-core';

export type EditorTrackKind = 'audio' | 'visual';

export const demoProject = {
  id: 'full-editor-lab',
  title: 'Launch Cut Lab',
  description: 'Private integration project for Canvas Timeline feature QA.',
  frameRate: 30,
  durationSeconds: 36,
} as const;

export const timelineMarkers: Marker[] = [];

export const timelineTracks: Track<EditorTrackKind>[] = [
  {
    id: 'track-v1',
    kind: 'visual',
    name: 'V1',
    locked: false,
    muted: false,
    visible: true,
    selected: false,
    targeted: true,
    height: 56,
    clips: [],
  },
  {
    id: 'track-a1',
    kind: 'audio',
    name: 'A1',
    locked: false,
    muted: false,
    visible: true,
    selected: false,
    targeted: true,
    height: 52,
    clips: [],
  },
];
