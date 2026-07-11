import { createEvent } from '@testing-library/react';
import React from 'react';
import { vi } from 'vite-plus/test';
import { TimelineContext } from '#react/context';
import {
  createTimelineScalarKeyframeProperty,
  TimelineEngine,
  type Clip,
  type Track,
} from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';

export const opacityKeyframeProperty = createTimelineScalarKeyframeProperty({
  id: 'opacity',
  label: 'Opacity',
  min: 0,
  max: 1,
  defaultValue: 1,
  getBaseValue: (clip) => clip.opacity ?? 1,
});

export const levelKeyframeProperty = createTimelineScalarKeyframeProperty({
  id: 'level',
  label: 'Level',
  min: -60,
  max: 6,
  defaultValue: 0,
});

export const wrapper = ({
  children,
  engine,
}: {
  children: React.ReactNode;
  engine: TimelineEngine;
}) => {
  return React.createElement(
    TimelineContext.Provider,
    {
      value: { engine, state: engine.getState() },
    },
    children
  );
};

export function createClip(
  id: string,
  start: number,
  end: number,
  overrides: Partial<Clip> = {}
): Clip {
  return {
    id,
    sourceId: `${id}-source`,
    timelineStart: fromSeconds(start),
    timelineEnd: fromSeconds(end),
    sourceStart: fromSeconds(0),
    selected: false,
    ...overrides,
  };
}

export function createTrack(id: string, clips: Clip[], overrides: Partial<Track> = {}): Track {
  return {
    id,
    kind: 'visual',
    selected: false,
    locked: false,
    muted: false,
    visible: true,
    clips,
    ...overrides,
  };
}

export function createDragDataTransfer(value: string): DataTransfer {
  const fileEntries: File[] = [];
  const itemEntries: DataTransferItem[] = [];
  const files: FileList = {
    length: 0,
    item: () => null,
    [Symbol.iterator]: () => fileEntries[Symbol.iterator](),
  };
  const items: DataTransferItemList = {
    length: 0,
    add: vi.fn(() => null),
    clear: vi.fn(),
    remove: vi.fn(),
    [Symbol.iterator]: () => itemEntries[Symbol.iterator](),
  };
  return {
    dropEffect: 'none',
    effectAllowed: 'all',
    files,
    items,
    types: ['text/plain'],
    clearData: vi.fn(),
    getData: vi.fn(() => value),
    setData: vi.fn(),
    setDragImage: vi.fn(),
  };
}

export function createTimelineDragEvent(
  type: 'dragOver' | 'drop',
  surface: Element,
  input: { clientX: number; clientY: number; dataTransfer: DataTransfer }
) {
  const event = type === 'dragOver' ? createEvent.dragOver(surface) : createEvent.drop(surface);
  Object.defineProperty(event, 'clientX', { value: input.clientX });
  Object.defineProperty(event, 'clientY', { value: input.clientY });
  Object.defineProperty(event, 'dataTransfer', { value: input.dataTransfer });
  return event;
}

export function createMediaSyncEngine() {
  return new TimelineEngine({
    duration: fromSeconds(12),
    playheadTime: fromSeconds(1),
    tracks: [
      {
        id: 'video-1',
        kind: 'visual',
        selected: false,
        locked: false,
        muted: false,
        visible: true,
        clips: [
          {
            id: 'video-clip',
            sourceId: 'source-1',
            timelineStart: fromSeconds(0),
            timelineEnd: fromSeconds(5),
            sourceStart: fromSeconds(10),
            selected: false,
          },
        ],
      },
      {
        id: 'audio-1',
        kind: 'audio',
        selected: false,
        locked: false,
        muted: false,
        visible: true,
        clips: [
          {
            id: 'audio-clip',
            sourceId: 'source-1',
            timelineStart: fromSeconds(0),
            timelineEnd: fromSeconds(5),
            sourceStart: fromSeconds(20),
            selected: false,
          },
        ],
      },
    ],
  });
}
