import { defaultTimelineInteractionGeometry, type Track } from '@techsquidtv/canvas-timeline-core';
import {
  useTimelineScrollLeft,
  useTimelineScrollTop,
  useTimelineZoomScale,
} from '@techsquidtv/canvas-timeline-react';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { toSeconds } from '@techsquidtv/canvas-timeline-utils';
import type { EditorTrackKind } from '@/data/demo-project';
import { cn } from '@/lib/cn';
import type { TimelineSourceDropMode } from '@/timeline/drop-mode-context';
import type { SourceDropPatch, SourceDropRejectReason } from '@/timeline/source-drop-placement';

interface TimelineSourceDropFeedbackProps {
  dropMode: TimelineSourceDropMode;
  dropTime: RationalTime | null;
  hoveredTrack: Track<EditorTrackKind> | null;
  patch: SourceDropPatch | null;
  tracks: readonly Track<EditorTrackKind>[];
  valid: boolean;
}

export function TimelineSourceDropFeedback({
  dropMode,
  dropTime,
  hoveredTrack,
  patch,
  tracks,
  valid,
}: TimelineSourceDropFeedbackProps) {
  const scrollLeft = useTimelineScrollLeft();
  const scrollTop = useTimelineScrollTop();
  const zoomScale = useTimelineZoomScale();

  if (dropTime === null || hoveredTrack === null || patch === null) {
    return null;
  }

  const dropLeft = toSeconds(dropTime) * zoomScale - scrollLeft;
  const width = Math.max(8, patch.durationSeconds * zoomScale);
  const previewTracks = [patch.visualTrack, patch.audioTrack].filter(
    (track): track is Track<EditorTrackKind> => track !== undefined
  );

  return (
    <>
      <div className="timeline-source-drop-line" style={{ left: `${dropLeft}px` }} />
      {valid
        ? previewTracks.map((track) => (
            <div
              key={track.id}
              className="timeline-source-drop-band"
              style={{
                left: `${dropLeft}px`,
                top: `${getTrackTop(track.id, tracks, scrollTop)}px`,
                width: `${width}px`,
                height: `${getTrackHeight(track)}px`,
              }}
            />
          ))
        : null}
      <div
        className={cn('timeline-source-drop-feedback', !valid && 'is-invalid')}
        aria-hidden="true"
      >
        {valid ? formatValidDropLabel(dropMode, patch) : formatRejectReason(patch.reason)}
      </div>
    </>
  );
}

function getTrackTop(
  trackId: string,
  tracks: readonly Track<EditorTrackKind>[],
  scrollTop: number
) {
  let top = defaultTimelineInteractionGeometry.rulerHeight - scrollTop;

  for (const track of tracks) {
    if (track.id === trackId) {
      return top;
    }
    top += getTrackHeight(track);
  }

  return top;
}

function getTrackHeight(track: Track<EditorTrackKind>) {
  return track.collapsed
    ? defaultTimelineInteractionGeometry.collapsedTrackHeight
    : (track.height ?? defaultTimelineInteractionGeometry.trackHeight);
}

function formatValidDropLabel(dropMode: TimelineSourceDropMode, patch: SourceDropPatch) {
  const modeLabel = dropMode === 'insert' ? 'Insert' : 'Overwrite';
  return patch.hasLinkedAudioVideo ? `${modeLabel} linked A/V` : modeLabel;
}

function formatRejectReason(reason: SourceDropRejectReason | undefined) {
  switch (reason) {
    case 'missing-companion-track':
      return 'Missing companion track';
    case 'source-not-ready':
      return 'Source unavailable';
    case 'track-kind-mismatch':
      return 'Wrong track type';
    case 'unsupported-source':
      return 'Unsupported source';
    case undefined:
      return 'Cannot drop source';
  }
}
