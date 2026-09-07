import { timelineCommandFail, timelineCommandOk } from '#react/hooks/core/timelineCommandResult';
import type { TimelineCommandResult } from '#react/hooks/core/timelineCommandResult';
import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { useTimelineSelector } from '#react/hooks/core/useTimelineSelector';
import { useTimelineSelection } from '#react/hooks/selection/useTimelineSelection';
import type { TimelineClipEntry, TimelineClipGroup } from '@techsquidtv/canvas-timeline-core';
import { useCallback, useMemo } from 'react';
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
  const engine = useTimelineEngine();
  const state = useTimelineSelector((state) => ({ clipGroups: state.clipGroups }));
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
