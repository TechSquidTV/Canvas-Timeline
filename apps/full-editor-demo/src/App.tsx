import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { TimelineProvider } from '@techsquidtv/canvas-timeline-react';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { useMemo } from 'react';
import { EditorShell } from './components/editor-shell/EditorShell';
import { MediaSyncProvider } from './components/editor-shell/MediaSyncProvider';
import { SourceBinProvider } from './components/source-bin/SourceBinProvider';
import { demoProject, timelineMarkers, timelineTracks } from './data/demo-project';

export function App() {
  const engine = useMemo(
    () =>
      new TimelineEngine({
        duration: fromSeconds(demoProject.durationSeconds),
        markers: timelineMarkers,
        playheadTime: fromSeconds(0),
        tracks: timelineTracks,
        zoomScale: 38,
      }),
    []
  );

  return (
    <TimelineProvider engine={engine}>
      <SourceBinProvider>
        <MediaSyncProvider>
          <EditorShell />
        </MediaSyncProvider>
      </SourceBinProvider>
    </TimelineProvider>
  );
}
