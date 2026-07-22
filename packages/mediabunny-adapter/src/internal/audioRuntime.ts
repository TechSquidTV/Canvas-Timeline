import type { ActiveClip, Clip } from '@techsquidtv/canvas-timeline-core';
import { toSeconds } from '@techsquidtv/canvas-timeline-utils';
import type * as Mediabunny from 'mediabunny';
import {
  type MediabunnySourceController,
  toMediaSeconds,
} from '#mediabunny-adapter/internal/sourceController';
import { getTimelinePlaybackSeconds } from '#mediabunny-adapter/internal/transportClock';

export function syncAudioClip(
  controller: MediabunnySourceController,
  audio: ActiveClip | undefined,
  onFailure?: (error: Error) => void
) {
  stopAudioIterator(controller);
  stopQueuedAudio(controller);
  controller.activeAudioSyncKey = audio?.syncKey;

  if (audio === undefined || controller.audioSink === null) {
    return;
  }

  const sourceStart = toMediaSeconds(controller, toSeconds(audio.sourceTime));
  const sourceEnd = toMediaSeconds(controller, toSeconds(audio.sourceRange.end));

  if (sourceEnd <= sourceStart) {
    return;
  }

  const iterator = controller.audioSink.buffers(sourceStart, sourceEnd);
  controller.audioBufferIterator = iterator;
  const generation = controller.audioPlaybackGeneration;
  void runAudioIterator(controller, iterator, audio.clip, audio.syncKey, generation).catch(
    (iteratorError: unknown) => {
      if (
        controller.audioPlaybackGeneration !== generation ||
        controller.audioBufferIterator !== iterator
      ) {
        return;
      }
      onFailure?.(
        iteratorError instanceof Error ? iteratorError : new Error(String(iteratorError))
      );
    }
  );
}

export function stopControllerAudio(controller: MediabunnySourceController) {
  controller.activeAudioSyncKey = undefined;
  stopAudioIterator(controller);
  stopQueuedAudio(controller);
}

export function stopQueuedAudio(controller: MediabunnySourceController) {
  for (const node of controller.queuedAudioNodes) {
    try {
      node.stop();
    } catch {
      // The node may already have ended.
    }
  }
  controller.queuedAudioNodes.clear();
}

export function stopAudioIterator(controller: MediabunnySourceController) {
  controller.audioPlaybackGeneration += 1;
  void controller.audioBufferIterator?.return();
  controller.audioBufferIterator = null;
}

async function runAudioIterator(
  controller: MediabunnySourceController,
  iterator: AsyncGenerator<Mediabunny.WrappedAudioBuffer, void, void>,
  audioClip: Clip,
  audioSyncKey: string,
  generation: number
) {
  if (
    controller.audioBufferIterator !== iterator ||
    controller.audioContext === null ||
    controller.gainNode === null
  ) {
    return;
  }

  const clipTimelineStart = toSeconds(audioClip.timelineStart);
  const clipSourceStart = toMediaSeconds(controller, toSeconds(audioClip.sourceStart));

  for await (const { buffer, timestamp } of iterator) {
    if (
      controller.audioPlaybackGeneration !== generation ||
      controller.audioBufferIterator !== iterator ||
      !controller.playing ||
      controller.audioContext === null ||
      controller.gainNode === null ||
      controller.audioContextStartTime === null ||
      controller.activeAudioSyncKey !== audioSyncKey
    ) {
      break;
    }

    const node = controller.audioContext.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = controller.playbackRate;
    node.connect(controller.gainNode);

    const timelineTimestamp = clipTimelineStart + (timestamp - clipSourceStart);
    let startTimestamp =
      controller.audioContextStartTime +
      (timelineTimestamp - controller.timelineTimeAtStart) / controller.playbackRate;
    startTimestamp =
      Math.round(controller.audioContext.sampleRate * startTimestamp) /
      controller.audioContext.sampleRate;

    if (startTimestamp >= controller.audioContext.currentTime) {
      node.start(startTimestamp);
    } else {
      const offset =
        (controller.audioContext.currentTime - startTimestamp) * controller.playbackRate;
      node.start(controller.audioContext.currentTime, offset);
    }

    controller.queuedAudioNodes.add(node);
    node.onended = () => {
      controller.queuedAudioNodes.delete(node);
    };

    if (timelineTimestamp - getTimelinePlaybackSeconds(controller) >= 1) {
      await new Promise<void>((resolve) => {
        const interval = window.setInterval(() => {
          if (
            controller.audioPlaybackGeneration !== generation ||
            !controller.playing ||
            timelineTimestamp - getTimelinePlaybackSeconds(controller) < 1
          ) {
            window.clearInterval(interval);
            resolve();
          }
        }, 100);
      });
    }
  }
}
