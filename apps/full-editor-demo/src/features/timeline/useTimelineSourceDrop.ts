import { isEditorTrack } from '#full-editor/features/project/demo-project';
import { useSourceBin } from '#full-editor/features/source-bin/source-bin-context';
import type { SourceBinSource } from '#full-editor/features/source-bin/types';
import { useTimelineDropMode } from '#full-editor/features/timeline/drop-mode-context';
import {
  createSourceBinDragPayload,
  readSourceBinDragPayload,
} from '#full-editor/features/timeline/source-drag-payload';
import {
  canCreateSourceDropPlacements,
  createSourceDropPlacements,
  resolveSourceDropPatch,
} from '#full-editor/features/timeline/source-drop-placement';
import { useEditorTracks } from '#full-editor/features/timeline/useEditorTracks';
import { defaultTimelineInteractionGeometry } from '@techsquidtv/canvas-timeline-core';
import { useTimelineExternalClipDrop } from '@techsquidtv/canvas-timeline-react';
import type { TimelineExternalClipDropContext } from '@techsquidtv/canvas-timeline-react';
import { useCallback, useMemo } from 'react';
import type { DragEvent } from 'react';
interface SourceTimelineDragData {
  source: SourceBinSource;
}

export function useTimelineSourceDrop() {
  const { activeDragSourceId, sources } = useSourceBin();
  const { dropMode } = useTimelineDropMode();
  const { tracks } = useEditorTracks();
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
    (context: TimelineExternalClipDropContext<SourceTimelineDragData>) => ({
      canDrop:
        isEditorTrack(context.targetTrack) &&
        canCreateSourceDropPlacements({
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
    (context: TimelineExternalClipDropContext<SourceTimelineDragData>) =>
      !isEditorTrack(context.targetTrack)
        ? []
        : createSourceDropPlacements({
            source: context.data.source,
            startTime: context.dropTime,
            targetTrack: context.targetTrack,
            tracks,
          }),
    [tracks]
  );
  const createDropGroup = useCallback(
    (context: TimelineExternalClipDropContext<SourceTimelineDragData>) => ({
      label: context.data.source.name,
    }),
    []
  );

  const drop = useTimelineExternalClipDrop<SourceTimelineDragData>({
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
