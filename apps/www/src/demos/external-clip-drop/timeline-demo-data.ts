import type { Marker, Track } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { getDemoClipColor } from '../demo-clip-colors';

export type ExternalClipDropTrackKind = 'visual' | 'audio';

export interface ExternalClipAsset {
  id: string;
  kind: 'visual' | 'linked-av';
  label: string;
  sourceId: string;
  durationSeconds: number;
  color: string;
}

export const externalClipAssets: ExternalClipAsset[] = [
  {
    id: 'broll',
    kind: 'visual',
    label: 'B-roll shot',
    sourceId: 'external-broll',
    durationSeconds: 2.5,
    color: getDemoClipColor(5),
  },
  {
    id: 'interview',
    kind: 'linked-av',
    label: 'Interview take',
    sourceId: 'external-interview',
    durationSeconds: 3,
    color: getDemoClipColor(2),
  },
];

export const demoTracks: Track<ExternalClipDropTrackKind>[] = [
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
        id: 'existing-video',
        sourceId: 'existing-video-source',
        timelineStart: fromSeconds(5),
        timelineEnd: fromSeconds(8),
        sourceStart: fromSeconds(0),
        selected: false,
        color: getDemoClipColor(1),
        label: 'Existing video',
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
        id: 'existing-audio',
        sourceId: 'existing-audio-source',
        timelineStart: fromSeconds(5),
        timelineEnd: fromSeconds(8),
        sourceStart: fromSeconds(0),
        selected: false,
        color: getDemoClipColor(3),
        label: 'Existing audio',
      },
    ],
  },
];

export const demoMarkers: Marker[] = [];
