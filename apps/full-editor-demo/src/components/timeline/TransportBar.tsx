import {
  TimecodeField,
  useTimelineMarkers,
  useTimelinePlayback,
  useTimelinePlayheadControl,
  useTimelinePlayheadTime,
  useTimelineSnapping,
} from '@techsquidtv/canvas-timeline-react';
import { Magnet, MapPin, Pause, Play, StepBack, StepForward, X } from 'lucide-react';
import { useEditorMediaSync } from '#full-editor/editor/shell/media-sync-context';
import { Button } from '#full-editor/components/ui/button';
import { Separator } from '#full-editor/components/ui/separator';
import { useEditorProject } from '#full-editor/editor/project/project-context';
import { getProjectFrameRatePreset } from '#full-editor/project/frame-rate';
import { CutSelectedClipButton } from '#full-editor/components/timeline/CutSelectedClipButton';

function PlayheadTimecodeControl() {
  const playheadControl = useTimelinePlayheadControl();
  const playheadTime = useTimelinePlayheadTime();
  const { metadata } = useEditorProject();
  const { timecodeFrameRate } = getProjectFrameRatePreset(metadata.frameRate);

  return (
    <TimecodeField.Root
      ariaLabel="Playhead timecode"
      formatOptions={{ frameRate: timecodeFrameRate }}
      onCommit={playheadControl.commit}
      parseOptions={{ frameRate: timecodeFrameRate }}
      value={playheadTime}
    >
      <TimecodeField.Trigger className="timeline-timecode-control-button" />
      <TimecodeField.Input className="timeline-timecode-control-input" />
    </TimecodeField.Root>
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
  const frameStepSeconds = 1 / getProjectFrameRatePreset(metadata.frameRate).value;

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
      <CutSelectedClipButton playheadSeconds={playheadControl.value} />
    </div>
  );
}
