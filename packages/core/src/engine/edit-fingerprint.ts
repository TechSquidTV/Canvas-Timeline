import type { Clip, TimelineEditCommand } from '#core/types';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';

const timeKey = (time: RationalTime | undefined) =>
  time === undefined ? null : `${time.v}/${time.r}`;

const clipKey = (clip: Clip) => ({
  id: clip.id,
  sourceId: clip.sourceId,
  timelineStart: timeKey(clip.timelineStart),
  timelineEnd: timeKey(clip.timelineEnd),
  sourceStart: timeKey(clip.sourceStart),
  selected: clip.selected,
  color: clip.color ?? null,
  opacity: clip.opacity ?? null,
  label: clip.label ?? null,
  movable: clip.movable ?? null,
  resizable: clip.resizable ?? null,
  disabled: clip.disabled ?? null,
  minStart: timeKey(clip.minStart),
  maxEnd: timeKey(clip.maxEnd),
  snap: clip.snap ?? null,
  keyframes:
    clip.keyframes?.map((keyframe) => ({
      id: keyframe.id,
      property: keyframe.property,
      time: timeKey(keyframe.time),
      value: keyframe.value,
      incoming: keyframe.incoming ?? null,
      outgoing: keyframe.outgoing ?? null,
      selected: keyframe.selected ?? null,
    })) ?? null,
});

export function createEditCommandFingerprint(command: TimelineEditCommand): string {
  switch (command.type) {
    case 'move':
      return JSON.stringify({
        type: command.type,
        clipId: command.clipId,
        startTime: timeKey(command.startTime),
        targetTrackId: command.targetTrackId ?? null,
        snap: command.snap ?? null,
        allowCrossKindTrackMove: command.allowCrossKindTrackMove ?? null,
      });
    case 'trim':
    case 'ripple-trim':
      return JSON.stringify({
        type: command.type,
        clipId: command.clipId,
        edge: command.edge,
        newTime: timeKey(command.newTime),
        snap: command.snap ?? null,
      });
    case 'roll-trim':
      return JSON.stringify({
        type: command.type,
        leftClipId: command.leftClipId,
        rightClipId: command.rightClipId,
        boundaryTime: timeKey(command.boundaryTime),
        snap: command.snap ?? null,
      });
    case 'slip':
      return JSON.stringify({
        type: command.type,
        clipId: command.clipId,
        deltaTime: timeKey(command.deltaTime),
      });
    case 'slide':
      return JSON.stringify({
        type: command.type,
        clipId: command.clipId,
        deltaTime: timeKey(command.deltaTime),
        snap: command.snap ?? null,
      });
    case 'split':
      return JSON.stringify({
        type: command.type,
        time: timeKey(command.time),
        clipIds: [...command.clipIds],
      });
    case 'delete-clips':
      return JSON.stringify({
        type: command.type,
        clipIds: [...command.clipIds],
      });
    case 'insert':
    case 'overwrite':
      return JSON.stringify({
        type: command.type,
        clip: clipKey(command.clip),
        targetTrackId: command.targetTrackId,
        startTime: timeKey(command.startTime),
        snap: command.snap ?? null,
      });
    case 'insert-clip-group':
    case 'overwrite-clip-group':
      return JSON.stringify({
        type: command.type,
        groupId: command.groupId ?? null,
        label: command.label ?? null,
        placements: command.placements.map((placement) => ({
          clip: clipKey(placement.clip),
          targetTrackId: placement.targetTrackId,
          startTime: timeKey(placement.startTime),
        })),
        snap: command.snap ?? null,
      });
    case 'delete-range':
      return JSON.stringify({
        type: command.type,
        startTime: timeKey(command.startTime),
        endTime: timeKey(command.endTime),
        trackIds: [...(command.trackIds ?? [])],
        ripple: command.ripple ?? null,
      });
    case 'lift-range':
      return JSON.stringify({
        type: command.type,
        startTime: timeKey(command.startTime),
        endTime: timeKey(command.endTime),
        trackIds: [...(command.trackIds ?? [])],
      });
  }
}
