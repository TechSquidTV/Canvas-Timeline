import type { EngineEventMap, ClipMoveEvent } from '#core/events';
import { TypedEventEmitter } from '#core/emitter';
import type { ClipboardManager } from '#core/clipboard';
import type { HistoryManager } from '#core/history';
import type { PlaybackManager } from '#core/playback';
import { SnapIndex } from '#core/snapping';
import type {
  TimelineEditImpacts,
  TimelineEditPolicy,
  TimelineEditPreview,
  TimelineState,
  Track,
} from '#core/types';
import { compareRational } from '@techsquidtv/canvas-timeline-utils';
import { KeyframePropertyRegistry } from '#core/engine/keyframe-property-registry';
import type { TimelineResolvedEdit } from '#core/engine/types';
import type { TimelineSnapProvider } from '#core/engine/snapping';
import type { TimelineZoomConstraints } from '#core/engine/geometry';

export abstract class TimelineEngineBase extends TypedEventEmitter<EngineEventMap> {
  protected state!: TimelineState;
  protected zoomConstraints: TimelineZoomConstraints = {};
  protected editPolicy: TimelineEditPolicy | undefined;
  protected activeClips = new Set<string>();
  protected snapIndex = new SnapIndex();
  protected snapProviders = new Set<TimelineSnapProvider>();
  protected keyframeProperties = new KeyframePropertyRegistry();

  protected playbackManager!: PlaybackManager;
  protected historyManager!: HistoryManager;
  protected clipboardManager!: ClipboardManager;

  protected dragSnapshot: string | null = null;
  protected editImpacts: TimelineEditImpacts | null = null;
  protected editPreview: TimelineEditPreview | null = null;
  protected editResolution: TimelineResolvedEdit | null = null;
  protected pendingClipMoveCommitEvent: ClipMoveEvent | null = null;

  protected getTracks<TrackKind = string>(): Track<TrackKind>[] {
    return this.state.tracks as Track<TrackKind>[];
  }

  protected sortTrackClips(track: Track) {
    track.clips.sort((a, b) => compareRational(a.timelineStart, b.timelineStart));
  }
}
