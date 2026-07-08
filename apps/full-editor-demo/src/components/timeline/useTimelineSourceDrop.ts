import { useCallback, useMemo, type DragEvent } from 'react';
import { defaultTimelineInteractionGeometry } from '@techsquidtv/canvas-timeline-core';
import {
  type TimelineExternalClipDropContext,
  useTimelineExternalClipDrop,
  useTimelineTracks,
} from '@techsquidtv/canvas-timeline-react';
import { useSourceBin } from '#full-editor/components/source-bin/source-bin-context';
import type { SourceBinSource } from '#full-editor/components/source-bin/types';
import type { EditorTrackKind } from '#full-editor/data/demo-project';
import { useTimelineDropMode } from '#full-editor/timeline/drop-mode-context';
import {
  createSourceBinDragPayload,
  readSourceBinDragPayload,
} from '#full-editor/timeline/source-drag-payload';
import {
  canCreateSourceDropPlacements,
  createSourceDropPlacements,
  resolveSourceDropPatch,
} from '#full-editor/timeline/source-drop-placement';

interface SourceTimelineDragData {
  source: SourceBinSource;
}

export function useTimelineSourceDrop() {
  const { activeDragSourceId, sources } = useSourceBin();
  const { dropMode } = useTimelineDropMode();
  const { tracks } = useTimelineTracks<EditorTrackKind>();
  const sourceById = useMemo(
    () => new Map(sources.map((source) => [source.id, source])),
    [sources]
  );
  const activeDragSource =
    activeDragSourceId === null ? null : (sourceById.get(activeDragSourceId) ?? null);

  const resolveDragData = useCallback(
    (event: DragEvent<HTMLElement>): SourceTimelineDragData | null => {
      const payload =
        readSourceBinDragPayload(event.dataTransfer) ??
        (activeDragSourceId === null ? null : createSourceBinDragPayload(activeDragSourceId));
      const source = payload === null ? undefined : sourceById.get(payload.sourceId);

      return source === undefined ? null : { source };
    },
    [activeDragSourceId, sourceById]
  );
  const canDropOnTrack = useCallback(
    (context: TimelineExternalClipDropContext<SourceTimelineDragData, EditorTrackKind>) => ({
      canDrop: canCreateSourceDropPlacements({
        source: context.data.source,
        startTime: context.dropTime,
        targetTrack: context.targetTrack,
        tracks,
      }),
      reason: 'unsupported' as const,
    }),
    [tracks]
  );
  const createPlacements = useCallback(
    (context: TimelineExternalClipDropContext<SourceTimelineDragData, EditorTrackKind>) =>
      createSourceDropPlacements({
        source: context.data.source,
        startTime: context.dropTime,
        targetTrack: context.targetTrack,
        tracks,
      }),
    [tracks]
  );
  const createDropGroup = useCallback(
    (context: TimelineExternalClipDropContext<SourceTimelineDragData, EditorTrackKind>) => ({
      label: context.data.source.name,
    }),
    []
  );

  const drop = useTimelineExternalClipDrop<SourceTimelineDragData, EditorTrackKind>({
    ...defaultTimelineInteractionGeometry,
    editMode: dropMode,
    resolveDragData,
    canDropOnTrack,
    createPlacements,
    group: createDropGroup,
  });
  const hoveredTrack =
    drop.hoveredTrackId === null
      ? null
      : (tracks.find((track) => track.id === drop.hoveredTrackId) ?? null);
  const previewPatch =
    activeDragSource === null || hoveredTrack === null
      ? null
      : resolveSourceDropPatch({
          source: activeDragSource,
          targetTrack: hoveredTrack,
          tracks,
        });

  return {
    drop,
    dropMode,
    hoveredTrack,
    previewPatch,
    tracks,
  };
}
