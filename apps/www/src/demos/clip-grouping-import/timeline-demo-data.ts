import type { Marker, Track } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { getDemoClipColor } from '../demo-clip-colors';

export type ClipGroupingTrackKind = 'visual' | 'audio';

export const demoTracks: Track<ClipGroupingTrackKind>[] = [
  {
    id: 'video-main',
    kind: 'visual',
    name: 'Video',
    locked: false,
    muted: false,
    visible: true,
    selected: false,
    height: 56,
    clips: [
      {
        id: 'video-clip',
        sourceId: 'shared-source',
        timelineStart: fromSeconds(3),
        timelineEnd: fromSeconds(9),
        sourceStart: fromSeconds(0),
        selected: false,
        color: getDemoClipColor(1),
        label: 'Video clip',
      },
    ],
  },
  {
    id: 'audio-main',
    kind: 'audio',
    name: 'Audio',
    locked: false,
    muted: false,
    visible: true,
    selected: false,
    height: 56,
    clips: [
      {
        id: 'audio-clip',
        sourceId: 'shared-source',
        timelineStart: fromSeconds(3),
        timelineEnd: fromSeconds(9),
        sourceStart: fromSeconds(0),
        selected: false,
        color: getDemoClipColor(3),
        label: 'Audio clip',
      },
    ],
  },
];

export const demoMarkers: Marker[] = [];

export const linkedClipGroupLabel = 'Linked pair';
