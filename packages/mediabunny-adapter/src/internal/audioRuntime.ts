import type { ActiveClip, Clip } from '@techsquidtv/canvas-timeline-core';
import { toSeconds } from '@techsquidtv/canvas-timeline-utils';
import type * as Mediabunny from 'mediabunny';
import type {
  CreateMediabunnyAdapterOptions,
  MediabunnyAudioStatus,
} from '#mediabunny-adapter/types';
import {
  type MediabunnyAudioController,
  toMediaSeconds,
} from '#mediabunny-adapter/internal/sourceController';
import type { MediabunnyTransportClock } from '#mediabunny-adapter/internal/transportClock';
import {
  getTimelinePlaybackSeconds,
  setTimelineClock,
} from '#mediabunny-adapter/internal/transportClock';

interface MediabunnyAudioRuntimeDependencies {
  isActive: () => boolean;
  notify: () => void;
  controllerValues: () => Iterable<MediabunnyAudioController>;
}

export class MediabunnyAudioRuntime {
  readonly #audioOptions: CreateMediabunnyAdapterOptions['audio'];
  readonly #transportClock: MediabunnyTransportClock;
  readonly #dependencies: MediabunnyAudioRuntimeDependencies;
  #context: AudioContext | null;
  #ownsContext = false;
  #masterGainNode: GainNode | null = null;
  #volume: number;
  #muted: boolean;
  #status: MediabunnyAudioStatus = { state: 'unavailable' };
  #activationGeneration = 0;
  #activationTimer: number | null = null;
  #pendingActivationRate: number | null = null;

  constructor(
    audioOptions: CreateMediabunnyAdapterOptions['audio'],
    initialVolume: number,
    transportClock: MediabunnyTransportClock,
    dependencies: MediabunnyAudioRuntimeDependencies
  ) {
    this.#audioOptions = audioOptions;
    this.#context = audioOptions?.context ?? null;
    this.#volume = initialVolume;
    this.#muted = audioOptions?.muted ?? false;
    this.#transportClock = transportClock;
    this.#dependencies = dependencies;
  }

  get context() {
    return this.#context;
  }

  get clockContext() {
    return this.#masterGainNode === null ? null : this.#context;
  }

  get volume() {
    return this.#volume;
  }

  get muted() {
    return this.#muted;
  }

  get status() {
    return this.#status;
  }

  ensure(notifyChange = true) {
    if (!this.#dependencies.isActive()) {
      return null;
    }
    if (this.#masterGainNode !== null && this.#context !== null) {
      return { context: this.#context, gainNode: this.#masterGainNode };
    }
    const AudioContextCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextCtor === undefined) {
      this.#status = {
        state: 'degraded',
        error: new Error('This browser does not expose AudioContext.'),
      };
      if (notifyChange) {
        this.#dependencies.notify();
      }
      return null;
    }
    if (this.#context === null) {
      this.#context = new AudioContextCtor();
      this.#ownsContext = true;
    }
    this.#masterGainNode = this.#context.createGain();
    this.#updateMasterGain();
    this.#masterGainNode.connect(this.#audioOptions?.destination ?? this.#context.destination);
    this.#status = { state: this.#context.state === 'running' ? 'running' : 'suspended' };
    if (notifyChange) {
      this.#dependencies.notify();
    }
    return { context: this.#context, gainNode: this.#masterGainNode };
  }

  activatePendingClock() {
    if (
      this.#pendingActivationRate === null ||
      this.#masterGainNode === null ||
      this.#context === null
    ) {
      return;
    }
    if (this.#context.state === 'running') {
      const timelineSeconds = this.#transportClock.getTime(this.clockContext);
      this.#pendingActivationRate = null;
      this.#resynchronizeClocks(timelineSeconds);
      this.#status = { state: 'running' };
      this.#dependencies.notify();
      return;
    }
    if (this.#context.state !== 'suspended') {
      this.#pendingActivationRate = null;
      this.#status = {
        state: 'degraded',
        error: new Error(`AudioContext cannot be activated from state "${this.#context.state}".`),
      };
      this.#dependencies.notify();
      return;
    }

    const context = this.#context;
    const generation = ++this.#activationGeneration;
    if (this.#activationTimer !== null) {
      window.clearTimeout(this.#activationTimer);
    }
    this.#activationTimer = window.setTimeout(() => {
      if (generation !== this.#activationGeneration || context.state === 'running') {
        return;
      }
      this.#pendingActivationRate = null;
      this.#status = { state: 'degraded', error: null };
      this.#dependencies.notify();
    }, this.#audioOptions?.activationTimeoutMs ?? 1000);
    void context.resume().then(
      () => {
        if (generation !== this.#activationGeneration || !this.#dependencies.isActive()) {
          return;
        }
        this.#clearActivationTimer();
        this.#pendingActivationRate = null;
        const timelineSeconds = this.#transportClock.getTime(this.clockContext);
        for (const controller of this.#dependencies.controllerValues()) {
          stopAudioIterator(controller);
          stopQueuedAudio(controller);
          controller.activeAudioSyncKey = undefined;
        }
        this.#resynchronizeClocks(timelineSeconds);
        this.#status = { state: 'running' };
        this.#dependencies.notify();
      },
      (activationError: unknown) => {
        if (generation !== this.#activationGeneration || !this.#dependencies.isActive()) {
          return;
        }
        this.#clearActivationTimer();
        this.#pendingActivationRate = null;
        this.#status = {
          state: 'degraded',
          error:
            activationError instanceof Error ? activationError : new Error(String(activationError)),
        };
        this.#dependencies.notify();
      }
    );
  }

  requestClockActivation(playbackRate: number) {
    this.#pendingActivationRate = playbackRate;
    this.activatePendingClock();
  }

  updatePendingActivationRate(playbackRate: number) {
    if (this.#pendingActivationRate !== null) {
      this.#pendingActivationRate = playbackRate;
    }
  }

  cancelPendingActivation() {
    this.#pendingActivationRate = null;
    this.#activationGeneration += 1;
    this.#clearActivationTimer();
  }

  setVolume(volume: number) {
    this.#volume = volume;
    this.#updateMasterGain();
  }

  setMuted(muted: boolean) {
    this.#muted = muted;
    this.#updateMasterGain();
  }

  dispose() {
    this.cancelPendingActivation();
    this.#masterGainNode?.disconnect();
    if (this.#ownsContext) {
      void this.#context?.close();
    }
    this.#masterGainNode = null;
  }

  #resynchronizeClocks(timelineSeconds: number) {
    const playbackRate = this.#transportClock.playbackRate;
    const playing = this.#transportClock.playing;
    this.#transportClock.set(timelineSeconds, playbackRate, playing, this.clockContext);
    for (const controller of this.#dependencies.controllerValues()) {
      setTimelineClock(controller, timelineSeconds, playbackRate);
      controller.playing = playing;
    }
  }

  #updateMasterGain() {
    if (this.#masterGainNode !== null) {
      this.#masterGainNode.gain.value = this.#muted ? 0 : this.#volume;
    }
  }

  #clearActivationTimer() {
    if (this.#activationTimer !== null) {
      window.clearTimeout(this.#activationTimer);
      this.#activationTimer = null;
    }
  }
}

export function syncAudioClip(
  controller: MediabunnyAudioController,
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

export function stopControllerAudio(controller: MediabunnyAudioController) {
  controller.activeAudioSyncKey = undefined;
  stopAudioIterator(controller);
  stopQueuedAudio(controller);
}

export function stopQueuedAudio(controller: MediabunnyAudioController) {
  for (const node of controller.queuedAudioNodes) {
    try {
      node.stop();
    } catch {
      // The node may already have ended.
    }
  }
  controller.queuedAudioNodes.clear();
}

export function stopAudioIterator(controller: MediabunnyAudioController) {
  controller.audioPlaybackGeneration += 1;
  void controller.audioBufferIterator?.return();
  controller.audioBufferIterator = null;
}

async function runAudioIterator(
  controller: MediabunnyAudioController,
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
