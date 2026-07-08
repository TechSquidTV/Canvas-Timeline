import type { Marker, Track } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { getDemoClipColor } from '#www/demos/demo-clip-colors';

export const demoTracks: Track<'visual' | 'audio'>[] = [
  {
    id: 'video-a',
    kind: 'visual',
    name: 'Video A',
    locked: false,
    muted: false,
    visible: true,
    selected: false,
    height: 48,
    clips: [
      {
        id: 'intro',
        sourceId: 'vid-intro',
        timelineStart: fromSeconds(1),
        timelineEnd: fromSeconds(5.5),
        sourceStart: fromSeconds(0),
        selected: false,
        color: getDemoClipColor(0),
        label: 'Intro sequence',
      },
      {
        id: 'main',
        sourceId: 'vid-main',
        timelineStart: fromSeconds(6.5),
        timelineEnd: fromSeconds(12.5),
        sourceStart: fromSeconds(0),
        selected: false,
        color: getDemoClipColor(1),
        label: 'Main feature clip',
      },
    ],
  },
  {
    id: 'overlay-b',
    kind: 'visual',
    name: 'Overlay B',
    locked: false,
    muted: false,
    visible: true,
    selected: false,
    height: 48,
    clips: [
      {
        id: 'b-roll',
        sourceId: 'vid-overlay',
        timelineStart: fromSeconds(3),
        timelineEnd: fromSeconds(8.5),
        sourceStart: fromSeconds(0),
        selected: false,
        color: getDemoClipColor(2),
        label: 'B-roll overlay',
      },
    ],
  },
  {
    id: 'audio-a',
    kind: 'audio',
    name: 'Ambient Soundtrack',
    locked: false,
    muted: false,
    visible: true,
    selected: false,
    height: 48,
    clips: [
      {
        id: 'score',
        sourceId: 'aud-score',
        timelineStart: fromSeconds(0),
        timelineEnd: fromSeconds(15),
        sourceStart: fromSeconds(0),
        selected: false,
        color: getDemoClipColor(3),
        label: 'Background score',
      },
    ],
  },
];

export const demoMarkers: Marker[] = [
  { id: 'm1', time: fromSeconds(1), label: 'M1' },
  { id: 'm2', time: fromSeconds(6.5), label: 'M2' },
];
