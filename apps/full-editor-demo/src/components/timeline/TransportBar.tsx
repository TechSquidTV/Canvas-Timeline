import {
  TimecodeField,
  useTimelineClips,
  useTimelineMarkers,
  useTimelinePlayback,
  useTimelinePlayheadControl,
  useTimelinePlayheadTime,
  useTimelineSnapping,
} from '@techsquidtv/canvas-timeline-react';
import { compareRational } from '@techsquidtv/canvas-timeline-utils';
import { Magnet, MapPin, Pause, Play, Scissors, StepBack, StepForward, X } from 'lucide-react';
import { useEditorMediaSync } from '@/editor/shell/media-sync-context';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useEditorProject } from '@/editor/project/project-context';
import type { EditorTrackKind } from '@/data/demo-project';

function PlayheadTimecodeControl() {
  const playheadControl = useTimelinePlayheadControl();
  const playheadTime = useTimelinePlayheadTime();

  return (
    <TimecodeField.Root
      ariaLabel="Playhead timecode"
      onCommit={playheadControl.commit}
      value={playheadTime}
    >
      <TimecodeField.Trigger className="timeline-timecode-control-button" />
      <TimecodeField.Input className="timeline-timecode-control-input" />
    </TimecodeField.Root>
  );
}

function CutSelectedClipButton() {
  const playheadTime = useTimelinePlayheadTime();
  const { selectedClip, splitClip } = useTimelineClips<EditorTrackKind>();
  const canCutSelectedClip =
    selectedClip !== null &&
    compareRational(playheadTime, selectedClip.timelineStart) > 0 &&
    compareRational(playheadTime, selectedClip.timelineEnd) < 0;

  return (
    <Button
      aria-label="Cut selected clip at playhead"
      disabled={!canCutSelectedClip}
      iconOnly
      onClick={() => {
        if (selectedClip !== null) {
          splitClip(selectedClip.id, playheadTime);
        }
      }}
      title={
        canCutSelectedClip
          ? 'Cut selected clip at playhead'
          : 'Select a clip and place the playhead inside it'
      }
      variant="ghost"
    >
      <Scissors aria-hidden="true" />
    </Button>
  );
}

export function TransportBar() {
  const media = useEditorMediaSync();
  const { metadata } = useEditorProject();
  const markers = useTimelineMarkers();
  const playback = useTimelinePlayback();
  const playheadControl = useTimelinePlayheadControl();
  const snapping = useTimelineSnapping();
  const hasInOutRange = playback.inPoint !== undefined || playback.outPoint !== undefined;
  const frameStepSeconds = 1 / metadata.frameRate;

  return (
    <div className="timeline-control-bar full-editor-transport">
      <Button
        aria-label="Move playhead back one frame"
        iconOnly
        onClick={() => playheadControl.commit(playheadControl.value - frameStepSeconds)}
        title="Back one frame"
        variant="ghost"
      >
        <StepBack aria-hidden="true" />
      </Button>
      <Button
        aria-label={media.playing ? 'Pause timeline and media' : 'Play timeline and media'}
        disabled={!media.ready}
        iconOnly
        onClick={() => {
          void media.togglePlay();
        }}
        title={media.playing ? 'Pause' : 'Play'}
        variant="primary"
      >
        {media.playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      </Button>
      <Button
        aria-label="Move playhead forward one frame"
        iconOnly
        onClick={() => playheadControl.commit(playheadControl.value + frameStepSeconds)}
        title="Forward one frame"
        variant="ghost"
      >
        <StepForward aria-hidden="true" />
      </Button>

      <div className="timeline-timecode-control-wrapper full-editor-timecode-control-wrapper">
        <PlayheadTimecodeControl />
      </div>

      <Button onClick={() => playback.setInPoint()} variant="ghost">
        <span className="timeline-range-badge full-editor-range-badge">I</span>
        In
      </Button>
      <Button onClick={() => playback.setOutPoint()} variant="ghost">
        <span className="timeline-range-badge full-editor-range-badge">O</span>
        Out
      </Button>
      <Button
        aria-label="Clear in and out points"
        disabled={!hasInOutRange}
        iconOnly
        onClick={() => playback.clearInOutPoints()}
        title="Clear range"
        variant="ghost"
      >
        <X aria-hidden="true" />
      </Button>

      <Separator orientation="vertical" />

      <Button
        aria-label={snapping.enabled ? 'Disable snapping' : 'Enable snapping'}
        aria-pressed={snapping.enabled}
        className={snapping.enabled ? 'is-active' : undefined}
        iconOnly
        onClick={() => snapping.setEnabled(!snapping.enabled)}
        title={snapping.enabled ? 'Disable snapping' : 'Enable snapping'}
        variant="ghost"
      >
        <Magnet aria-hidden="true" />
      </Button>
      <Button
        aria-label="Add marker"
        iconOnly
        onClick={() => markers.addMarkerAtPlayhead(`M${markers.markers.length + 1}`)}
        title="Add marker"
        variant="ghost"
      >
        <MapPin aria-hidden="true" />
      </Button>
      <CutSelectedClipButton />
    </div>
  );
}
