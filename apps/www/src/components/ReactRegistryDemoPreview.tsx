import { TimelineEngine, type Marker, type Track } from '@techsquidtv/canvas-timeline-core';
import {
  formatTimecode,
  parseTimecode,
  type TimecodeFormatOptions,
  type TimecodeParseOptions,
} from '@techsquidtv/canvas-timeline-utils/timecode';
import {
  RangeScrollbar,
  Timeline,
  TimelineProvider,
  TimecodeField,
  TimecodeInput,
  useActiveClips,
  useActiveLayers,
  useTimeline,
  useTimelineClips,
  useTimelineClipNavigation,
  useTimelineClipboard,
  useTimelineEditCommands,
  useTimelineHistory,
  useTimelinePlayback,
  useTimelinePlayheadControl,
  useTimelinePlayheadTime,
  useTimelineState,
  useTimelineViewport,
  useTimelineZoomControl,
} from '@techsquidtv/canvas-timeline-react';
import { CanvasRenderer } from '@techsquidtv/canvas-timeline-renderer';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import type { ReactRegistryDemoVariant } from '@/data/react-registry';
import {
  demoMarkers as basicDemoMarkers,
  demoTracks as basicDemoTracks,
} from '@/demos/basic-editor-surface/timeline-demo-data';
import '@techsquidtv/canvas-timeline-react/styles.css';

interface ReactRegistryDemoPreviewProps {
  variant: ReactRegistryDemoVariant;
}

interface TimecodeDemoFormatOption {
  value: string;
  label: string;
  formatOptions: TimecodeFormatOptions;
}

const timecodeFormatOptions = [
  { value: 'seconds', label: 'Seconds', formatOptions: { format: 'seconds' } },
  { value: 'minutes', label: 'Minutes', formatOptions: { format: 'minutes' } },
  { value: 'hours', label: 'Hours', formatOptions: { format: 'hours' } },
  {
    value: 'frames-24',
    label: '24 fps',
    formatOptions: { format: 'frames', frameRate: 24 },
  },
  {
    value: 'drop-frame-2997',
    label: '29.97 DF',
    formatOptions: {
      format: 'drop-frame',
      frameRate: { numerator: 30000, denominator: 1001 },
      dropFrame: true,
    },
  },
] satisfies [TimecodeDemoFormatOption, ...TimecodeDemoFormatOption[]];
const timecodeDemoInitialSeconds = 3723.04;
const timecodeFieldInitialTime = fromSeconds(90.5, 24000);

function getParseOptionsFromFormat(
  option: TimecodeDemoFormatOption
): TimecodeParseOptions | undefined {
  const parseOptions: TimecodeParseOptions = {};

  if (option.formatOptions.frameRate !== undefined) {
    parseOptions.frameRate = option.formatOptions.frameRate;
  }

  if (option.formatOptions.format === 'drop-frame') {
    parseOptions.dropFrame = true;
  } else if (option.formatOptions.dropFrame !== undefined) {
    parseOptions.dropFrame = option.formatOptions.dropFrame;
  }

  return Object.keys(parseOptions).length === 0 ? undefined : parseOptions;
}

function createPreviewTracks(): Track<'visual' | 'audio'>[] {
  return basicDemoTracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      const previewClip = { ...clip };
      delete previewClip.color;
      return previewClip;
    }),
  }));
}

function createPreviewMarkers(): Marker[] {
  return basicDemoMarkers.map((marker) => ({ ...marker }));
}

function createPreviewEngine(variant: ReactRegistryDemoVariant) {
  const tracks = createPreviewTracks();
  const engine = new TimelineEngine({
    duration: fromSeconds(15),
    markers: variant === 'range-selection' ? [] : createPreviewMarkers(),
    playheadTime: fromSeconds(7),
    scrollLeft: 120,
    tracks: variant === 'range-selection' ? [] : variant === 'clip' ? tracks.slice(0, 1) : tracks,
    zoomScale: 72,
  });

  engine.setViewportWidth(640);
  if (variant === 'vertical-scrollbar') {
    engine.setViewportHeight(112);
    engine.setScrollTop(24);
  }
  if (variant === 'range-selection') {
    engine.setInPoint(fromSeconds(4), false);
    engine.setOutPoint(fromSeconds(9), false);
    engine.setSnappingEnabled(false);
  }
  return engine;
}

function RegistryDemoProvider({
  children,
  variant,
}: {
  children: ReactNode;
  variant: ReactRegistryDemoVariant;
}) {
  const engine = useMemo(() => createPreviewEngine(variant), [variant]);

  return <TimelineProvider engine={engine}>{children}</TimelineProvider>;
}

function TrackLayers({ mode }: { mode: 'surface' | 'track' | 'clip' | 'playhead' | 'range' }) {
  const { state } = useTimeline();
  const tracks = mode === 'clip' ? state.tracks.slice(0, 1) : state.tracks;
  const showPlayhead = mode === 'surface' || mode === 'playhead' || mode === 'range';

  return (
    <>
      {showPlayhead && <Timeline.PlayheadArea />}
      {showPlayhead && <Timeline.PlayheadGrabber />}
      {mode !== 'playhead' && mode !== 'range' && (
        <Timeline.TrackList className="timeline-track-list-overlay">
          {tracks.map((track) => (
            <Timeline.Track key={track.id} trackId={track.id} />
          ))}
        </Timeline.TrackList>
      )}
      {(mode === 'surface' || mode === 'clip') && <Timeline.ClipInteractionLayer />}
      {mode === 'range' && <Timeline.RangeSelector />}
    </>
  );
}

function TimelineRootDemo({ mode }: { mode: 'surface' | 'track' | 'clip' | 'playhead' | 'range' }) {
  return (
    <div className={`registry-live-root-frame registry-live-root-frame--${mode}`}>
      <Timeline.Root className="registry-live-root">
        <CanvasRenderer />
        <TrackLayers mode={mode} />
      </Timeline.Root>
    </div>
  );
}

function RangeScrollbarDemo() {
  const [value, setValue] = useState({ start: 18, end: 62 });

  return (
    <div className="registry-live-scrollbar-frame">
      <RangeScrollbar.Root
        min={0}
        max={100}
        value={value}
        minSpan={8}
        className="registry-live-scrollbar"
        onValueChange={setValue}
      >
        <RangeScrollbar.Thumb className="registry-live-scrollbar-thumb">
          <RangeScrollbar.Handle
            side="start"
            className="registry-live-scrollbar-handle registry-live-scrollbar-handle--left"
          />
          <div className="registry-live-scrollbar-fill" />
          <RangeScrollbar.Handle
            side="end"
            className="registry-live-scrollbar-handle registry-live-scrollbar-handle--right"
          />
        </RangeScrollbar.Thumb>
      </RangeScrollbar.Root>
    </div>
  );
}

function TimecodeInputBasicDemo() {
  const [text, setText] = useState(() =>
    formatTimecode(toSeconds(timecodeFieldInitialTime), { format: 'seconds' })
  );
  const invalid = parseTimecode(text) === null;

  return (
    <div className="registry-live-timecode-frame">
      <TimecodeInput
        aria-label="Clip start timecode"
        className="registry-live-timecode-input"
        invalid={invalid}
        value={text}
        onValueChange={(value) => setText(value)}
      />
    </div>
  );
}

function TimecodeInputFormattingDemo() {
  const [formatValue, setFormatValue] = useState('seconds');
  const [text, setText] = useState(() =>
    formatTimecode(timecodeDemoInitialSeconds, { format: 'seconds' })
  );
  const selectedOption = useMemo(
    () =>
      timecodeFormatOptions.find((option) => option.value === formatValue) ??
      timecodeFormatOptions[0],
    [formatValue]
  );
  const parseOptions = useMemo(() => getParseOptionsFromFormat(selectedOption), [selectedOption]);
  const handleFormatChange = useCallback(
    (nextFormatValue: string) => {
      const nextOption = timecodeFormatOptions.find((option) => option.value === nextFormatValue);
      const nextSeconds = parseTimecode(text, parseOptions);

      if (!nextOption) {
        return;
      }

      setFormatValue(nextOption.value);

      if (nextSeconds !== null) {
        setText(formatTimecode(nextSeconds, nextOption.formatOptions));
      }
    },
    [parseOptions, text]
  );
  const parsed = parseTimecode(text, parseOptions);
  const invalid = parsed === null;

  return (
    <div className="registry-live-timecode-frame">
      <TimecodeInput
        aria-label="Clip start timecode"
        className="registry-live-timecode-input"
        invalid={invalid}
        value={text}
        onValueChange={(value) => setText(value)}
      />
      <div className="registry-live-timecode-actions">
        <select
          aria-label="Timecode format"
          className="registry-live-timecode-select"
          value={formatValue}
          onChange={(event) => handleFormatChange(event.currentTarget.value)}
        >
          {timecodeFormatOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {parsed === null
                ? option.label
                : `${option.label} (${formatTimecode(parsed, option.formatOptions)})`}
            </option>
          ))}
        </select>
        <span className="registry-live-timecode-readout">
          {parsed === null ? 'Invalid' : `${parsed.toFixed(4)}s`}
        </span>
      </div>
    </div>
  );
}

function TimecodeFieldBasicDemo() {
  const [time, setTime] = useState(timecodeFieldInitialTime);

  return (
    <div className="registry-live-timecode-frame">
      <TimecodeField.Root
        ariaLabel="Clip start"
        className="registry-live-timecode-field"
        value={time}
        formatOptions={{ format: 'seconds' }}
        timebase={time.r}
        onCommit={(_seconds, details) => setTime(details.time)}
      >
        <TimecodeField.Trigger className="registry-live-timecode-field-trigger" />
        <TimecodeField.Input className="registry-live-timecode-field-input" />
      </TimecodeField.Root>
    </div>
  );
}

function TimecodeFieldFormattingDemo() {
  const [time, setTime] = useState(timecodeFieldInitialTime);
  const [formatValue, setFormatValue] = useState('seconds');
  const selectedOption =
    timecodeFormatOptions.find((option) => option.value === formatValue) ??
    timecodeFormatOptions[0];
  const seconds = toSeconds(time);

  return (
    <div className="registry-live-timecode-frame">
      <TimecodeField.Root
        ariaLabel="Clip start"
        className="registry-live-timecode-field"
        value={time}
        formatOptions={selectedOption.formatOptions}
        timebase={time.r}
        onCommit={(_seconds, details) => setTime(details.time)}
      >
        <TimecodeField.Trigger className="registry-live-timecode-field-trigger" />
        <TimecodeField.Input className="registry-live-timecode-field-input" />
      </TimecodeField.Root>
      <div className="registry-live-timecode-actions">
        <select
          aria-label="Timecode field format"
          className="registry-live-timecode-select"
          value={formatValue}
          onChange={(event) => setFormatValue(event.currentTarget.value)}
        >
          {timecodeFormatOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {`${option.label} (${formatTimecode(seconds, option.formatOptions)})`}
            </option>
          ))}
        </select>
        <span className="registry-live-timecode-readout">
          {formatTimecode(seconds, { format: 'seconds' })}s
        </span>
      </div>
    </div>
  );
}

function ViewportScrollbarDemo() {
  return (
    <div className="registry-live-scrollbar-frame">
      <Timeline.ViewportScrollbar className="registry-live-scrollbar">
        <Timeline.ViewportScrollbarThumb className="registry-live-scrollbar-thumb">
          <Timeline.ViewportScrollbarHandle
            side="start"
            className="registry-live-scrollbar-handle registry-live-scrollbar-handle--left"
          />
          <div className="registry-live-scrollbar-fill" />
          <Timeline.ViewportScrollbarHandle
            side="end"
            className="registry-live-scrollbar-handle registry-live-scrollbar-handle--right"
          />
        </Timeline.ViewportScrollbarThumb>
      </Timeline.ViewportScrollbar>
    </div>
  );
}

function VerticalScrollbarDemo() {
  const { state } = useTimeline();

  return (
    <div className="registry-live-scrollbar-frame registry-live-scrollbar-frame--vertical">
      <div className="registry-live-vertical-scrollbar-layout">
        <div className="registry-live-vertical-track-stack" aria-hidden="true">
          {state.tracks.map((track) => (
            <div key={track.id} className="registry-live-vertical-track-row">
              {track.name ?? track.id}
            </div>
          ))}
        </div>
        <Timeline.VerticalScrollbar className="registry-live-scrollbar registry-live-scrollbar--vertical">
          <Timeline.VerticalScrollbarThumb className="registry-live-scrollbar-thumb registry-live-scrollbar-thumb--vertical">
            <Timeline.VerticalScrollbarHandle side="start" />
            <Timeline.VerticalScrollbarHandle side="end" />
          </Timeline.VerticalScrollbarThumb>
        </Timeline.VerticalScrollbar>
      </div>
    </div>
  );
}

function TimelineStateHookDemo() {
  const { engine } = useTimeline();
  const state = useTimelineState();
  const activeClips = useActiveClips();
  const activeLayers = useActiveLayers({
    layers: {
      visuals: { trackKind: 'visual' },
      audio: { trackKind: 'audio' },
    },
  });

  return (
    <div className="registry-live-panel">
      <span>{state.tracks.length} tracks</span>
      <span>{activeClips.length} active clips</span>
      <span>{activeLayers.hasActiveClips ? 'Layers active' : 'No layers active'}</span>
      <span>{Math.round(engine.zoomScale)} px/s</span>
    </div>
  );
}

function EditingHooksDemo() {
  const { selectedClip, selectClip } = useTimelineClips();
  const { copySelection } = useTimelineClipboard();
  const { deleteClip } = useTimelineEditCommands();
  const { canUndo, undo } = useTimelineHistory();
  const [status, setStatus] = useState('main selected');

  return (
    <div className="registry-live-panel">
      <span>Selected: {selectedClip?.label ?? 'none'}</span>
      <button
        type="button"
        onClick={() => {
          selectClip('intro');
          setStatus('intro selected');
        }}
      >
        Select intro
      </button>
      <button
        type="button"
        onClick={() => {
          copySelection();
          setStatus('selection copied');
        }}
      >
        Copy
      </button>
      <button
        disabled={!selectedClip}
        type="button"
        onClick={() => {
          if (selectedClip) {
            deleteClip(selectedClip.id);
          }
          setStatus('clip deleted');
        }}
      >
        Delete
      </button>
      <button disabled={!canUndo} type="button" onClick={undo}>
        Undo
      </button>
      <span>{status}</span>
    </div>
  );
}

function PlaybackControlsDemo() {
  const playback = useTimelinePlayback();
  const playheadTime = useTimelinePlayheadTime();
  const viewport = useTimelineViewport();

  return (
    <div className="registry-live-panel">
      <button type="button" onClick={playback.togglePlayback}>
        {playback.playing ? 'Pause' : 'Play'}
      </button>
      <button type="button" onClick={() => playback.stepBackward(1)}>
        -1s
      </button>
      <button type="button" onClick={() => playback.stepForward(1)}>
        +1s
      </button>
      <button type="button" onClick={() => viewport.setZoomScale(viewport.zoomScale - 50)}>
        Zoom out
      </button>
      <button type="button" onClick={() => viewport.setZoomScale(viewport.zoomScale + 50)}>
        Zoom in
      </button>
      <span>{toSeconds(playheadTime).toFixed(1)}s</span>
    </div>
  );
}

function AccessibleControlsDemo() {
  const playhead = useTimelinePlayheadControl();
  const zoom = useTimelineZoomControl();
  const clips = useTimelineClipNavigation();

  return (
    <div className="registry-live-panel" {...clips.focusTargetProps}>
      <span>{playhead.valueText}</span>
      <span>{zoom.valueText}</span>
      <span>{clips.activeClip?.name ?? 'No clip'}</span>
      <button type="button" onClick={() => clips.navigateBy(1)}>
        Next clip
      </button>
      <button type="button" onClick={clips.selectActiveClip}>
        Select
      </button>
    </div>
  );
}

function DemoBody({ variant }: ReactRegistryDemoPreviewProps) {
  switch (variant) {
    case 'timeline-surface':
      return <TimelineRootDemo mode="surface" />;
    case 'track':
      return <TimelineRootDemo mode="track" />;
    case 'clip':
      return <TimelineRootDemo mode="clip" />;
    case 'playhead':
      return <TimelineRootDemo mode="playhead" />;
    case 'range-selection':
      return <TimelineRootDemo mode="range" />;
    case 'range-scrollbar':
      return <RangeScrollbarDemo />;
    case 'timecode-input-basic':
      return <TimecodeInputBasicDemo />;
    case 'timecode-input-formatting':
      return <TimecodeInputFormattingDemo />;
    case 'timecode-field-basic':
      return <TimecodeFieldBasicDemo />;
    case 'timecode-field-formatting':
      return <TimecodeFieldFormattingDemo />;
    case 'viewport-scrollbar':
      return <ViewportScrollbarDemo />;
    case 'vertical-scrollbar':
      return <VerticalScrollbarDemo />;
    case 'timeline-state':
      return <TimelineStateHookDemo />;
    case 'editing-hooks':
      return <EditingHooksDemo />;
    case 'playback-controls':
      return <PlaybackControlsDemo />;
    case 'accessible-controls':
      return <AccessibleControlsDemo />;
  }

  const exhaustiveVariant: never = variant;
  return exhaustiveVariant;
}

export default function ReactRegistryDemoPreview({ variant }: ReactRegistryDemoPreviewProps) {
  return (
    <div className="registry-shadcn-theme">
      <RegistryDemoProvider key={variant} variant={variant}>
        <DemoBody variant={variant} />
      </RegistryDemoProvider>
    </div>
  );
}
