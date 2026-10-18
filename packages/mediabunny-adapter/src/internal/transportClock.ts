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

function applyTimelinePlaybackClock(
  state: TimelinePlaybackClockState,
  timelineSeconds: number,
  playbackRate: number,
  playing: boolean,
  audioContext: AudioContext | null
) {
  state.timelineTimeAtStart = timelineSeconds;
  state.audioContextStartTime = audioContext?.currentTime ?? null;
  state.audioClockReady = audioContext?.state === 'running';
  state.wallClockStartTime = playing ? performance.now() / 1000 : null;
  state.playbackRate = playbackRate;
  state.playing = playing;
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

  getFallbackTime() {
    return readTimelinePlaybackSeconds(this.#state, null);
  }

  set(
    timelineSeconds: number,
    playbackRate: number,
    playing: boolean,
    audioContext: AudioContext | null
  ) {
    applyTimelinePlaybackClock(this.#state, timelineSeconds, playbackRate, playing, audioContext);
  }
}

export function setTimelineClock(
  controller: MediabunnyTransportController,
  timelineSeconds: number,
  playbackRate: number,
  playing: boolean
) {
  applyTimelinePlaybackClock(
    controller,
    timelineSeconds,
    playbackRate,
    playing,
    controller.audioContext
  );
}

export function getTimelinePlaybackSeconds(controller: MediabunnyTransportController) {
  return readTimelinePlaybackSeconds(controller, controller.audioContext);
}
