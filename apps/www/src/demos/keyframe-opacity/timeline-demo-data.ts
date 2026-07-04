import type { Marker, Track } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { getDemoClipColor } from '../demo-clip-colors';

export const sampleSourceId = 'big-buck-bunny-keyframe-preview';

export const sampleMediaUrl = '/demo-media/big-buck-bunny-preview.webm';
export const sampleDurationSeconds = 24;
export const opacityClipId = 'opacity-demo-clip';

export const demoTracks: Track<'visual'>[] = [
  {
    id: 'opacity-video-track',
    kind: 'visual',
    name: 'Opacity',
    locked: false,
    muted: false,
    visible: true,
    selected: true,
    targeted: true,
    height: 64,
    clips: [
      {
        id: opacityClipId,
        sourceId: sampleSourceId,
        timelineStart: fromSeconds(0),
        timelineEnd: fromSeconds(sampleDurationSeconds),
        sourceStart: fromSeconds(0),
        selected: true,
        color: getDemoClipColor(1),
        label: 'Opacity keyframes',
        keyframes: [
          {
            id: 'opacity-kf-0',
            property: 'opacity',
            time: fromSeconds(0),
            value: 1,
            interpolation: 'linear',
          },
          {
            id: 'opacity-kf-1',
            property: 'opacity',
            time: fromSeconds(5),
            value: 0.28,
            interpolation: 'linear',
          },
          {
            id: 'opacity-kf-2',
            property: 'opacity',
            time: fromSeconds(10),
            value: 0.82,
            interpolation: 'bezier',
            easing: { x1: 0.16, y1: 1, x2: 0.3, y2: 1 },
          },
          {
            id: 'opacity-kf-3',
            property: 'opacity',
            time: fromSeconds(15),
            value: 0.42,
            interpolation: 'linear',
          },
          {
            id: 'opacity-kf-4',
            property: 'opacity',
            time: fromSeconds(sampleDurationSeconds),
            value: 1,
            interpolation: 'linear',
          },
        ],
      },
    ],
  },
];

export const demoMarkers: Marker[] = [
  {
    id: 'fade-down',
    time: fromSeconds(5),
    label: 'Fade',
  },
  {
    id: 'hold-step',
    time: fromSeconds(10),
    label: 'Peak',
  },
];
