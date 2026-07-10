import { TimelineEngine, type TimelineRulerFormatOptions } from '@techsquidtv/canvas-timeline-core';
import {
  TimelineProvider,
  Timeline,
  useTimeline,
  useTimelineVisibleClips,
} from '@techsquidtv/canvas-timeline-react';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { useMemo, useState } from 'react';
import { demoTracks, demoMarkers } from '#www/demos/react-dom-timeline/timeline-demo-data';
import { ControlBar } from '#www/demos/react-dom-timeline/timeline-controls';
import { RulerDOM, DOMClip } from '#www/demos/react-dom-timeline/DOMTimelineComponents';
import '@techsquidtv/canvas-timeline-react/styles.css';

type RulerFormat = TimelineRulerFormatOptions['format'];

const rulerFormats = [
  { id: 'seconds', label: 'Seconds' },
  { id: 'timecode', label: 'Timecode' },
  { id: 'frame-number', label: 'Frame number' },
] as const satisfies ReadonlyArray<{ id: RulerFormat; label: string }>;

function isRulerFormat(value: string): value is RulerFormat {
  return rulerFormats.some((format) => format.id === value);
}

function getRulerOptions(format: RulerFormat): TimelineRulerFormatOptions {
  return format === 'seconds' ? { format } : { format, frameRate: 30 };
}

function TimelineLayers({ ruler }: { ruler: TimelineRulerFormatOptions }) {
  const { state } = useTimeline();
  const visibleClips = useTimelineVisibleClips();

  const tracks = state.tracks;

  return (
    <>
      <RulerDOM ruler={ruler} />
      <Timeline.PlayheadArea />
      <Timeline.PlayheadGrabber />
      <Timeline.TrackList className="timeline-track-list-overlay">
        {tracks.map((track) => (
          <Timeline.Track key={track.id} trackId={track.id} className="timeline-dom-track">
            {visibleClips
              .filter((clip) => clip.track.id === track.id)
              .map((clip) => (
                <DOMClip key={clip.clip.id} clip={clip} />
              ))}
          </Timeline.Track>
        ))}
      </Timeline.TrackList>
      <Timeline.ClipInteractionLayer />
      <Timeline.RangeSelector />
    </>
  );
}

export function ReactDOMTimeline() {
  const [rulerFormat, setRulerFormat] = useState<RulerFormat>('seconds');
  const ruler = getRulerOptions(rulerFormat);
  const engine = useMemo(
    () =>
      new TimelineEngine({
        duration: fromSeconds(15),
        playheadTime: fromSeconds(2),
        zoomScale: 74,
        tracks: demoTracks,
        markers: demoMarkers,
      }),
    []
  );

  return (
    <TimelineProvider engine={engine}>
      <div className="timeline-shell timeline-controls-shell">
        <ControlBar>
          <div className="timeline-control-field">
            <label className="timeline-control-field-label" htmlFor="dom-ruler-format">
              Ruler:
            </label>
            <select
              id="dom-ruler-format"
              className="timeline-control-select"
              value={rulerFormat}
              onChange={(event) => {
                if (isRulerFormat(event.target.value)) {
                  setRulerFormat(event.target.value);
                }
              }}
            >
              {rulerFormats.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.label}
                </option>
              ))}
            </select>
          </div>
        </ControlBar>

        {/* Stage area */}
        <div className="timeline-stage">
          <Timeline.Root className="timeline-fill">
            <TimelineLayers ruler={ruler} />
          </Timeline.Root>
        </div>

        {/* Bottom Scrollbar row */}
        <div className="timeline-scrollbar-row">
          <Timeline.ViewportScrollbar>
            <Timeline.ViewportScrollbarThumb>
              <Timeline.ViewportScrollbarHandle side="start" />
              <Timeline.ViewportScrollbarHandle side="end" />
            </Timeline.ViewportScrollbarThumb>
          </Timeline.ViewportScrollbar>
        </div>
      </div>
    </TimelineProvider>
  );
}
