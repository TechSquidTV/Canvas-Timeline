import type { Marker, Track } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { getDemoClipColor } from '#www/demos/demo-clip-colors';

export const sampleSourceId = 'big-buck-bunny-preview';

const sampleMediaUrl = '/demo-media/big-buck-bunny-preview.webm';
export const sampleMediaSource = { id: sampleSourceId, url: sampleMediaUrl } as const;
export const sampleDurationSeconds = 66.06;

export const demoTracks: Track<'visual' | 'audio'>[] = [
  {
    id: 'video-preview',
    kind: 'visual',
    name: 'Preview Video',
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
        label: 'Big Buck Bunny preview video',
      },
    ],
  },
  {
    id: 'audio-preview',
    kind: 'audio',
    name: 'Preview Audio',
    locked: false,
    muted: false,
    visible: true,
    selected: false,
    height: 48,
    clips: [
      {
        id: 'bunny-audio',
        sourceId: sampleSourceId,
        timelineStart: fromSeconds(0),
        timelineEnd: fromSeconds(sampleDurationSeconds),
        sourceStart: fromSeconds(0),
        selected: false,
        color: getDemoClipColor(1),
        label: 'Big Buck Bunny preview audio',
      },
    ],
  },
];

export const demoMarkers: Marker[] = [];
