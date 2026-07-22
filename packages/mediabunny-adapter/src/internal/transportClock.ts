import type { MediabunnySourceController } from '#mediabunny-adapter/internal/sourceController';

export function setTimelineClock(
  controller: MediabunnySourceController,
  timelineSeconds: number,
  playbackRate: number
) {
  controller.timelineTimeAtStart = timelineSeconds;
  controller.audioContextStartTime = controller.audioContext?.currentTime ?? null;
  controller.audioClockReady = controller.audioContext?.state === 'running';
  controller.wallClockStartTime = performance.now() / 1000;
  controller.playbackRate = playbackRate;
}

export function getTimelinePlaybackSeconds(controller: MediabunnySourceController) {
  if (
    controller.playing &&
    controller.audioContext !== null &&
    controller.audioContextStartTime !== null &&
    controller.audioClockReady &&
    controller.audioContext.state === 'running'
  ) {
    return (
      controller.timelineTimeAtStart +
      (controller.audioContext.currentTime - controller.audioContextStartTime) *
        controller.playbackRate
    );
  }

  if (controller.playing && controller.wallClockStartTime !== null) {
    return (
      controller.timelineTimeAtStart +
      (performance.now() / 1000 - controller.wallClockStartTime) * controller.playbackRate
    );
  }

  return controller.timelineTimeAtStart;
}
