import { useCallback, useMemo } from 'react';
import type { TimelineClipEntry, TimelineClipGroup } from '@techsquidtv/canvas-timeline-core';
import { useTimeline } from '../core/useTimeline';
import { useTimelineSelection } from '../selection/useTimelineSelection';
import {
  timelineCommandFail,
  timelineCommandOk,
  type TimelineCommandResult,
} from '../core/timelineCommandResult';

/** Result returned by `useTimelineClipGroups`. */
export interface UseTimelineClipGroupsResult {
  /** Current clip groups. */
  groups: TimelineClipGroup[];
  /** Selected clip group, or null when the primary selected clip is ungrouped. */
  selectedGroup: TimelineClipGroup | null;
  /** Selected clip group id, or null when the primary selected clip is ungrouped. */
  selectedGroupId: string | null;
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
  const { engine, state } = useTimeline();
  const { selectedClipIds, selectedGroup, selectedGroupId } = useTimelineSelection();
  const groups = useMemo(() => state.clipGroups, [state.clipGroups]);

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
    (clipIds: readonly string[], label?: string) => {
      const group = engine.createClipGroup({ clipIds, ...(label !== undefined ? { label } : {}) });
      return group === null
        ? timelineCommandFail<TimelineClipGroup>('invalid-range')
        : timelineCommandOk(group);
    },
    [engine]
  );

  const ungroupClipGroup = useCallback(
    (groupId: string) =>
      engine.ungroupClipGroup(groupId) ? timelineCommandOk() : timelineCommandFail('not-found'),
    [engine]
  );

  const ungroupSelectedClips = useCallback(() => {
    return engine.ungroupClips(selectedClipIds)
      ? timelineCommandOk()
      : timelineCommandFail('not-found');
  }, [engine, selectedClipIds]);

  return {
    groups,
    selectedGroup,
    selectedGroupId,
    getClipGroup,
    getClipGroupForClip,
    getClipGroupClips,
    groupClips,
    ungroupClipGroup,
    ungroupSelectedClips,
  };
}
