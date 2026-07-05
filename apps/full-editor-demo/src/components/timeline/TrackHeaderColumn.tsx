import {
  Timeline,
  useTimeline,
  useTimelineTrackLockControl,
} from '@techsquidtv/canvas-timeline-react';
import { Eye, EyeOff, Lock, Unlock, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';

function TrackLockButton({ trackId }: { trackId: string }) {
  const lockControl = useTimelineTrackLockControl(trackId);

  return (
    <Button
      {...lockControl.buttonProps}
      className="timeline-editor-track-header-button"
      iconOnly
      variant="ghost"
    >
      {lockControl.locked ? <Lock aria-hidden="true" /> : <Unlock aria-hidden="true" />}
    </Button>
  );
}

export function TrackHeaderColumn() {
  const { state } = useTimeline();

  return (
    <Timeline.TrackHeaderList className="timeline-editor-track-headers">
      {state.tracks.map((track) => (
        <Timeline.TrackHeader key={track.id} trackId={track.id}>
          {(header) => {
            const isAudio = header.kind === 'audio';
            const title = isAudio
              ? header.muted
                ? `Unmute ${header.label}`
                : `Mute ${header.label}`
              : header.visible
                ? `Hide ${header.label}`
                : `Show ${header.label}`;

            return (
              <div className="timeline-editor-track-header-content">
                <Button
                  aria-label={title}
                  aria-pressed={isAudio ? header.muted : !header.visible}
                  className="timeline-editor-track-header-button"
                  iconOnly
                  onClick={() => {
                    if (isAudio) {
                      header.setMuted(!header.muted);
                    } else {
                      header.setVisible(!header.visible);
                    }
                  }}
                  title={title}
                  variant="ghost"
                >
                  {isAudio ? (
                    header.muted ? (
                      <VolumeX aria-hidden="true" />
                    ) : (
                      <Volume2 aria-hidden="true" />
                    )
                  ) : header.visible ? (
                    <Eye aria-hidden="true" />
                  ) : (
                    <EyeOff aria-hidden="true" />
                  )}
                </Button>
                <TrackLockButton trackId={track.id} />
                <span className="timeline-editor-track-header-label">{header.label}</span>
                <Timeline.TrackHeaderResizeHandle trackId={track.id} />
              </div>
            );
          }}
        </Timeline.TrackHeader>
      ))}
    </Timeline.TrackHeaderList>
  );
}
