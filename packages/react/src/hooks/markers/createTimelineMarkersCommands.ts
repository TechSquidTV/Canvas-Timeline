import { runTimelineCommand } from '#react/hooks/core/runTimelineCommand';
import { timelineCommandFail, timelineCommandOk } from '@techsquidtv/canvas-timeline-core';
import type { Marker, TimelineReadonly, TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { compareRational } from '@techsquidtv/canvas-timeline-utils';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import type {
  TimelineMarkerUpdate,
  UseTimelineMarkersResult,
} from '#react/hooks/markers/useTimelineMarkers';

export function sortTimelineMarkers(markers: readonly TimelineReadonly<Marker>[] = []) {
  return [...markers].sort((left, right) => compareRational(left.time, right.time));
}

/** Shared imperative commands. Reads current engine state at invocation. */
export function createTimelineMarkersCommands(
  engine: TimelineEngine
): Omit<UseTimelineMarkersResult, 'markers'> {
  const findPreviousMarker = (time: RationalTime) =>
    sortTimelineMarkers(engine.getState().markers)
      .reverse()
      .find((marker) => compareRational(marker.time, time) < 0) ?? null;

  const findNextMarker = (time: RationalTime) =>
    sortTimelineMarkers(engine.getState().markers).find(
      (marker) => compareRational(marker.time, time) > 0
    ) ?? null;

  const addMarker = (time: RationalTime, label?: string, color?: string, description?: string) =>
    runTimelineCommand(() => {
      const marker = engine.addMarker(time, label, color, description);
      return timelineCommandOk(marker);
    });

  const addMarkerAtPlayhead = (label?: string, color?: string, description?: string) =>
    addMarker(engine.playheadTime, label, color, description);

  const removeMarker = (id: string) =>
    runTimelineCommand(() =>
      engine.removeMarker(id) ? timelineCommandOk() : timelineCommandFail('not-found')
    );

  const updateMarker = (id: string, updates: TimelineMarkerUpdate) =>
    runTimelineCommand(() => {
      const marker = engine.updateMarker(id, updates);
      return marker
        ? timelineCommandOk(marker)
        : timelineCommandFail<TimelineReadonly<Marker>>('not-found');
    });

  const seekToMarker = (id: string) =>
    runTimelineCommand(() => {
      const marker = engine.getState().markers?.find((candidate) => candidate.id === id);
      if (!marker) {
        return timelineCommandFail<TimelineReadonly<Marker>>('not-found');
      }
      engine.updatePlayhead(marker.time);
      return timelineCommandOk(marker);
    });

  const seekToNextMarker = () =>
    runTimelineCommand(() => {
      const nextMarker = findNextMarker(engine.playheadTime);
      if (!nextMarker) {
        return timelineCommandFail<TimelineReadonly<Marker>>('not-found');
      }
      engine.updatePlayhead(nextMarker.time);
      return timelineCommandOk(nextMarker);
    });

  const seekToPreviousMarker = () =>
    runTimelineCommand(() => {
      const previousMarker = findPreviousMarker(engine.playheadTime);
      if (!previousMarker) {
        return timelineCommandFail<TimelineReadonly<Marker>>('not-found');
      }
      engine.updatePlayhead(previousMarker.time);
      return timelineCommandOk(previousMarker);
    });
  return {
    addMarker,
    addMarkerAtPlayhead,
    removeMarker,
    updateMarker,
    seekToMarker,
    seekToNextMarker,
    seekToPreviousMarker,
  };
}
