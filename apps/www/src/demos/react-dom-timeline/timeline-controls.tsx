import {
  useTimeline,
  useTimelinePlayback,
  useTimelineClips,
  useTimelinePlayheadTime,
  TimecodeField,
} from '@techsquidtv/canvas-timeline-react';
import { clamp, compareRational, fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { Magnet, MapPin, Pause, Play, Scissors, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback } from 'react';

function PlayheadTimecodeControl() {
  const { engine, state } = useTimeline();
  const playheadTime = useTimelinePlayheadTime();

  const handleTimecodeCommit = useCallback(
    (seconds: number) => {
      const durationSeconds =
        state.duration !== undefined ? toSeconds(state.duration) : Number.POSITIVE_INFINITY;
      const bounded = clamp(seconds, 0, durationSeconds);
      engine.updatePlayhead(fromSeconds(bounded, playheadTime.r));
      engine.settle();
    },
    [engine, playheadTime.r, state.duration]
  );

  return (
    <div className="timeline-timecode-control-wrapper">
      <TimecodeField.Root
        ariaLabel="playhead timecode"
        onCommit={handleTimecodeCommit}
        value={playheadTime}
      >
        <TimecodeField.Trigger className="timeline-timecode-control-button" />
        <TimecodeField.Input className="timeline-timecode-control-input" />
      </TimecodeField.Root>
    </div>
  );
}

function CutSelectedClipButton() {
  const playheadTime = useTimelinePlayheadTime();
  const { selectedClip, splitClip } = useTimelineClips();
  const canCutSelectedClip =
    selectedClip !== null &&
    compareRational(playheadTime, selectedClip.timelineStart) > 0 &&
    compareRational(playheadTime, selectedClip.timelineEnd) < 0;
  const cutButtonTitle = canCutSelectedClip
    ? 'Cut selected clip at playhead'
    : 'Select a clip and place the playhead inside it';

  return (
    <button
      type="button"
      className="timeline-control-button timeline-control-button-icon-only"
      onClick={() => selectedClip && splitClip(selectedClip.id, playheadTime)}
      title={cutButtonTitle}
      aria-label="Cut selected clip at playhead"
      disabled={!canCutSelectedClip}
    >
      <Scissors aria-hidden="true" />
    </button>
  );
}

// Control Bar Component
export function ControlBar() {
  const { engine, state } = useTimeline();
  const { pause, play, playing } = useTimelinePlayback();

  const togglePlay = useCallback(() => {
    if (playing) {
      pause();
    } else {
      play({ loop: true, respectInOut: true });
    }
  }, [pause, play, playing]);

  const hasInOutRange = state.inPoint !== undefined || state.outPoint !== undefined;

  return (
    <div className="timeline-control-bar">
      {/* Play/Pause Button */}
      <button
        type="button"
        className="timeline-control-button timeline-control-button-icon-only"
        onClick={togglePlay}
        title="Play / Pause"
        aria-label={playing ? 'Pause timeline' : 'Play timeline'}
      >
        {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      </button>

      {/* Timecode Editable display */}
      <PlayheadTimecodeControl />

      <div className="timeline-control-divider" />

      {/* In/Out markers buttons */}
      <button
        type="button"
        className="timeline-control-button"
        onClick={() => engine.setInPoint(engine.playheadTime)}
        title="Set In Point"
        aria-label="Set in point"
      >
        <span className="timeline-range-badge">I</span>
        In
      </button>
      <button
        type="button"
        className="timeline-control-button"
        onClick={() => engine.setOutPoint(engine.playheadTime)}
        title="Set Out Point"
        aria-label="Set out point"
      >
        <span className="timeline-range-badge">O</span>
        Out
      </button>

      <button
        type="button"
        className={`timeline-control-button timeline-control-button-icon-only${hasInOutRange ? '' : ' timeline-control-button-hidden'}`}
        onClick={() => engine.clearInOutPoints()}
        title="Clear Range"
        aria-label="Clear Range"
        disabled={!hasInOutRange}
      >
        <X aria-hidden="true" />
      </button>

      <div className="timeline-control-divider" />

      {/* Snapping Toggle */}
      <button
        type="button"
        className={`timeline-control-button timeline-control-button-icon-only ${engine.isSnappingEnabled ? 'timeline-control-button-active' : ''}`}
        onClick={() => engine.setSnappingEnabled(!engine.isSnappingEnabled)}
        title={engine.isSnappingEnabled ? 'Disable snapping' : 'Enable snapping'}
        aria-label={engine.isSnappingEnabled ? 'Disable snapping' : 'Enable snapping'}
        aria-pressed={engine.isSnappingEnabled}
      >
        <Magnet aria-hidden="true" />
      </button>

      {/* Add Marker Button */}
      <button
        type="button"
        className="timeline-control-button timeline-control-button-icon-only"
        onClick={() => {
          engine.addMarker(engine.playheadTime, `M${(state.markers?.length ?? 0) + 1}`);
        }}
        title="Add marker"
        aria-label="Add marker"
      >
        <MapPin aria-hidden="true" />
      </button>

      <CutSelectedClipButton />

      <div className="timeline-control-divider" />

      {/* Timeline Bounds Dropdown */}
      <div className="timeline-control-field">
        <span className="timeline-control-field-label">Bounds:</span>
        <select
          className="timeline-control-select"
          value={
            state.duration !== undefined ? Math.round(toSeconds(state.duration)).toString() : ''
          }
          onChange={(e) => {
            const durationSeconds = Number(e.target.value);
            engine.setDuration(
              e.target.value === ''
                ? undefined
                : fromSeconds(durationSeconds, state.duration?.r ?? engine.playheadTime.r)
            );
          }}
          aria-label="Timeline bounds"
        >
          <option value="">Dynamic</option>
          <option value="15">15s</option>
          <option value="30">30s</option>
          <option value="60">60s</option>
        </select>
      </div>

      {/* Zoom and Pan Controls */}
      <div className="timeline-controls-right">
        {/* Zoom Controls */}
        <div className="timeline-slider-container">
          <button
            type="button"
            className="timeline-control-button timeline-control-button-icon-only"
            onClick={() => engine.setZoomScale(Math.max(10, state.zoomScale - 50))}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut aria-hidden="true" />
          </button>
          <input
            type="range"
            min="10"
            max="1000"
            step="10"
            value={state.zoomScale}
            onChange={(e) => engine.setZoomScale(parseFloat(e.target.value))}
            className="timeline-control-slider"
            aria-label="Zoom timeline"
          />
          <button
            type="button"
            className="timeline-control-button timeline-control-button-icon-only"
            onClick={() => engine.setZoomScale(Math.min(1000, state.zoomScale + 50))}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn aria-hidden="true" />
          </button>
          <span className="timeline-slider-value">{state.zoomScale.toFixed(0)}</span>
        </div>

        <div className="timeline-control-divider" />

        {/* Pan Control */}
        <div className="timeline-slider-container">
          <span className="timeline-control-field-label">Pan:</span>
          <input
            type="range"
            min="0"
            max={engine.maxScrollLeft}
            value={state.scrollLeft}
            onChange={(e) => engine.setScrollLeft(parseFloat(e.target.value))}
            className="timeline-control-slider"
            aria-label="Pan timeline"
          />
          <span className="timeline-slider-value">{state.scrollLeft.toFixed(0)}px</span>
        </div>
      </div>
    </div>
  );
}
