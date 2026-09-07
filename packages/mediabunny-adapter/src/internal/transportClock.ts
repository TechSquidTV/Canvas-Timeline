import type { MediabunnyTransportController } from '#mediabunny-adapter/internal/sourceController';

interface TimelinePlaybackClockState {
  timelineTimeAtStart: number;
  audioContextStartTime: number | null;
  audioClockReady: boolean;
  wallClockStartTime: number | null;
  playbackRate: number;
  playing: boolean;
}

function readTimelinePlaybackSeconds(
  clock: TimelinePlaybackClockState,
  audioContext: AudioContext | null
) {
  if (
    clock.playing &&
    audioContext !== null &&
    clock.audioContextStartTime !== null &&
    clock.audioClockReady &&
    audioContext.state === 'running'
  ) {
    return (
      clock.timelineTimeAtStart +
      (audioContext.currentTime - clock.audioContextStartTime) * clock.playbackRate
    );
  }

  if (clock.playing && clock.wallClockStartTime !== null) {
    return (
      clock.timelineTimeAtStart +
      (performance.now() / 1000 - clock.wallClockStartTime) * clock.playbackRate
    );
  }

  return clock.timelineTimeAtStart;
}

export class MediabunnyTransportClock {
  readonly #state: TimelinePlaybackClockState = {
    timelineTimeAtStart: 0,
    audioContextStartTime: null,
    audioClockReady: false,
    wallClockStartTime: null,
    playbackRate: 1,
    playing: false,
  };

  get playbackRate() {
    return this.#state.playbackRate;
  }

  get playing() {
    return this.#state.playing;
  }

  getTime(audioContext: AudioContext | null) {
    return readTimelinePlaybackSeconds(this.#state, audioContext);
  }

  set(
    timelineSeconds: number,
    playbackRate: number,
    playing: boolean,
    audioContext: AudioContext | null
  ) {
    this.#state.timelineTimeAtStart = timelineSeconds;
    this.#state.audioContextStartTime = audioContext?.currentTime ?? null;
    this.#state.audioClockReady = audioContext?.state === 'running';
    this.#state.wallClockStartTime = playing ? performance.now() / 1000 : null;
    this.#state.playing = playing;
    this.#state.playbackRate = playbackRate;
  }
}

export function setTimelineClock(
  controller: MediabunnyTransportController,
  timelineSeconds: number,
  playbackRate: number
) {
  controller.timelineTimeAtStart = timelineSeconds;
  controller.audioContextStartTime = controller.audioContext?.currentTime ?? null;
  controller.audioClockReady = controller.audioContext?.state === 'running';
  controller.wallClockStartTime = performance.now() / 1000;
  controller.playbackRate = playbackRate;
}

export function getTimelinePlaybackSeconds(controller: MediabunnyTransportController) {
  return readTimelinePlaybackSeconds(controller, controller.audioContext);
}
