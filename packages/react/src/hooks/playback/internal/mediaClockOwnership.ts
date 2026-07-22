import type { TimelineMediaSyncAdapter } from '@techsquidtv/canvas-timeline-core';

export interface PendingMediaPlaybackStart<LayerName extends string, PlayResult> {
  generation: number;
  adapter: TimelineMediaSyncAdapter<LayerName>;
  promise: Promise<PlayResult>;
}

export interface MediaClockOwner<LayerName extends string> {
  generation: number;
  adapter: TimelineMediaSyncAdapter<LayerName>;
  identity: object | undefined;
}

export class MediaClockOwnership<LayerName extends string, PlayResult> {
  barrier: Promise<void> = Promise.resolve();
  owner: MediaClockOwner<LayerName> | null = null;
  pending: PendingMediaPlaybackStart<LayerName, PlayResult> | null = null;
}
