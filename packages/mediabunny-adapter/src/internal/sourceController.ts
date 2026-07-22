import type { TimelineMediaSourceTiming } from '@techsquidtv/canvas-timeline-core';
import type * as Mediabunny from 'mediabunny';

export interface MediabunnySourceController {
  sourceId: string;
  input: Mediabunny.Input | null;
  ownsInput: boolean;
  inputIndex: number;
  mediaTimeOffsetSeconds: number;
  videoSink: Mediabunny.CanvasSink | null;
  audioSink: Mediabunny.AudioBufferSink | null;
  audioContext: AudioContext | null;
  gainNode: GainNode | null;
  audioBufferIterator: AsyncGenerator<Mediabunny.WrappedAudioBuffer, void, void> | null;
  queuedAudioNodes: Set<AudioBufferSourceNode>;
  timelineTimeAtStart: number;
  audioContextStartTime: number | null;
  audioClockReady: boolean;
  wallClockStartTime: number | null;
  playbackRate: number;
  playing: boolean;
  activeAudioSyncKey: string | undefined;
  audioPlaybackGeneration: number;
  asyncId: number;
  renderingFrame: boolean;
  currentFrameRequest: PendingFrameRequest | undefined;
  pendingFrameRequest: PendingFrameRequest | undefined;
  videoPlaybackGeneration: number;
  videoPlaybackIterator: AsyncGenerator<Mediabunny.WrappedCanvas, void, unknown> | null;
  videoPlaybackFutureFrame: Mediabunny.WrappedCanvas | null;
  videoPlaybackProcessing: boolean;
  videoPlaybackEnded: boolean;
  videoPlaybackSyncKey: string | undefined;
  videoPlaybackSourceSeconds: number | null;
  videoPlaybackTargetSeconds: number | null;
  videoPlaybackCanvas: HTMLCanvasElement | null;
  videoPlaybackIsCurrent: (() => boolean) | undefined;
  videoPlaybackOnFrame: ((timestamp: number) => void) | undefined;
  videoPlaybackOnFailure: ((error: Error) => void) | undefined;
  lastRenderedVideoTimestamp: number | null;
}

export type MediabunnySourceTimeController = Pick<
  MediabunnySourceController,
  'mediaTimeOffsetSeconds'
>;

export type MediabunnyTransportController = Pick<
  MediabunnySourceController,
  | 'timelineTimeAtStart'
  | 'audioContextStartTime'
  | 'audioClockReady'
  | 'wallClockStartTime'
  | 'playbackRate'
  | 'playing'
  | 'audioContext'
>;

export type MediabunnyAudioController = MediabunnySourceTimeController &
  MediabunnyTransportController &
  Pick<
    MediabunnySourceController,
    | 'audioSink'
    | 'gainNode'
    | 'audioBufferIterator'
    | 'queuedAudioNodes'
    | 'activeAudioSyncKey'
    | 'audioPlaybackGeneration'
  >;

export type MediabunnyVideoController = MediabunnySourceTimeController &
  Pick<
    MediabunnySourceController,
    | 'videoSink'
    | 'asyncId'
    | 'renderingFrame'
    | 'currentFrameRequest'
    | 'pendingFrameRequest'
    | 'videoPlaybackGeneration'
    | 'videoPlaybackIterator'
    | 'videoPlaybackFutureFrame'
    | 'videoPlaybackProcessing'
    | 'videoPlaybackEnded'
    | 'videoPlaybackSyncKey'
    | 'videoPlaybackSourceSeconds'
    | 'videoPlaybackTargetSeconds'
    | 'videoPlaybackCanvas'
    | 'videoPlaybackIsCurrent'
    | 'videoPlaybackOnFrame'
    | 'videoPlaybackOnFailure'
    | 'lastRenderedVideoTimestamp'
  >;

export interface PendingFrameRequest {
  canvas: HTMLCanvasElement;
  sourceSeconds: number;
  onFrame?: (timestamp: number) => void;
  isCurrent: () => boolean;
  resolve: () => void;
  reject: (error: Error) => void;
}

export function createController(
  sourceId: string,
  inputIndex: number,
  timing: TimelineMediaSourceTiming | undefined
): MediabunnySourceController {
  return {
    sourceId,
    inputIndex,
    mediaTimeOffsetSeconds:
      timing === undefined ? 0 : timing.mediaTimeSeconds - timing.sourceTimeSeconds,
    input: null,
    ownsInput: true,
    videoSink: null,
    audioSink: null,
    audioContext: null,
    gainNode: null,
    audioBufferIterator: null,
    queuedAudioNodes: new Set(),
    timelineTimeAtStart: 0,
    audioContextStartTime: null,
    audioClockReady: false,
    wallClockStartTime: null,
    playbackRate: 1,
    playing: false,
    activeAudioSyncKey: undefined,
    audioPlaybackGeneration: 0,
    asyncId: 0,
    renderingFrame: false,
    currentFrameRequest: undefined,
    pendingFrameRequest: undefined,
    videoPlaybackGeneration: 0,
    videoPlaybackIterator: null,
    videoPlaybackFutureFrame: null,
    videoPlaybackProcessing: false,
    videoPlaybackEnded: false,
    videoPlaybackSyncKey: undefined,
    videoPlaybackSourceSeconds: null,
    videoPlaybackTargetSeconds: null,
    videoPlaybackCanvas: null,
    videoPlaybackIsCurrent: undefined,
    videoPlaybackOnFrame: undefined,
    videoPlaybackOnFailure: undefined,
    lastRenderedVideoTimestamp: null,
  };
}

export function toMediaSeconds(controller: MediabunnySourceTimeController, sourceSeconds: number) {
  return sourceSeconds + controller.mediaTimeOffsetSeconds;
}

export function toLogicalSourceSeconds(
  controller: MediabunnySourceTimeController,
  mediaSeconds: number
) {
  return mediaSeconds - controller.mediaTimeOffsetSeconds;
}
