import { runTimelineCommand } from '#react/hooks/core/runTimelineCommand';
import { timelineCommandFail, timelineCommandOk } from '@techsquidtv/canvas-timeline-core';
import type {
  TimelineCommandResult,
  TimelineReadonly,
  TimelineClipEntry,
  TimelineClipGroup,
} from '@techsquidtv/canvas-timeline-core';
import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { useTimelineSelector } from '#react/hooks/core/useTimelineSelector';
import { useCallback } from 'react';
/** Result returned by `useTimelineClipGroups`. */
export interface UseTimelineClipGroupsResult {
  /** Current clip groups. */
  groups: readonly TimelineReadonly<TimelineClipGroup>[];
  /** Returns one clip group by id. */
  getClipGroup: (groupId: string) => TimelineClipGroup | undefined;
  /** Returns the clip group containing a clip. */
  getClipGroupForClip: (clipId: string) => TimelineClipGroup | undefined;
  /** Returns clips contained by a group in group order. */
  getClipGroupClips: (groupId: string) => TimelineClipEntry[];
  /** Groups existing clips. */
  groupClips: (
    clipIds: readonly string[],
    label?: string
  ) => TimelineCommandResult<TimelineClipGroup>;
  /** Removes one clip group. */
  ungroupClipGroup: (groupId: string) => TimelineCommandResult;
  /** Removes the current selected group, or groups containing selected clips. */
  ungroupSelectedClips: () => TimelineCommandResult;
}

/**
 * Exposes clip group state and commands for editor chrome.
 *
 * @returns Clip group collection, selected group metadata, lookups, and commands.
 */
export function useTimelineClipGroups(): UseTimelineClipGroupsResult {
  const engine = useTimelineEngine();
  const state = useTimelineSelector((state) => ({ clipGroups: state.clipGroups }));
  const groups = state.clipGroups;

  const getClipGroup = useCallback((groupId: string) => engine.getClipGroup(groupId), [engine]);
  const getClipGroupForClip = useCallback(
    (clipId: string) => engine.getClipGroupForClip(clipId),
    [engine]
  );
  const getClipGroupClips = useCallback(
    (groupId: string) => engine.getClipGroupClips(groupId),
    [engine]
  );

  const groupClips = useCallback(
    (clipIds: readonly string[], label?: string) =>
      runTimelineCommand(() => {
        const group = engine.createClipGroup({
          clipIds,
          ...(label !== undefined ? { label } : {}),
        });
        return group === null
          ? timelineCommandFail<TimelineClipGroup>('invalid-range')
          : timelineCommandOk(group);
      }),
    [engine]
  );

  const ungroupClipGroup = useCallback(
    (groupId: string) =>
      runTimelineCommand(() =>
        engine.ungroupClipGroup(groupId) ? timelineCommandOk() : timelineCommandFail('not-found')
      ),
    [engine]
  );

  const ungroupSelectedClips = useCallback(
    () =>
      runTimelineCommand(() => {
        return engine.ungroupClips(engine.getSelectedClipIds())
          ? timelineCommandOk()
          : timelineCommandFail('not-found');
      }),
    [engine]
  );

  return {
    groups,
    getClipGroup,
    getClipGroupForClip,
    getClipGroupClips,
    groupClips,
    ungroupClipGroup,
    ungroupSelectedClips,
  };
}
