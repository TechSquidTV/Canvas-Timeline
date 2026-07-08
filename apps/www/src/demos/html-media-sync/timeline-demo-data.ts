import type { Marker, Track } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { getDemoClipColor } from '#www/demos/demo-clip-colors';

export const sampleSourceId = 'big-buck-bunny-preview';

export const sampleMediaUrl = '/demo-media/big-buck-bunny-preview.webm';
export const sampleDurationSeconds = 66.06;

export const demoTracks: Track<'visual'>[] = [
  {
    id: 'video-preview',
    kind: 'visual',
    name: 'HTML Media',
    locked: false,
    muted: false,
    visible: true,
    selected: false,
    targeted: true,
    height: 48,
    clips: [
      {
        id: 'bunny-video',
        sourceId: sampleSourceId,
        timelineStart: fromSeconds(0),
        timelineEnd: fromSeconds(sampleDurationSeconds),
        sourceStart: fromSeconds(0),
        selected: false,
        color: getDemoClipColor(0),
        label: 'Big Buck Bunny HTML media',
      },
    ],
  },
];

export const demoMarkers: Marker[] = [];
