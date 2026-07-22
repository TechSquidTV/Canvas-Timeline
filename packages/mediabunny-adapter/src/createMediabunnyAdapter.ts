import type {
  ActiveClip,
  ActiveLayerResult,
  TimelineLayerSyncDetails,
  TimelineMediaSyncReason,
} from '@techsquidtv/canvas-timeline-core';
import { toSeconds, type RationalTime } from '@techsquidtv/canvas-timeline-utils';
import type * as Mediabunny from 'mediabunny';
import type { CreateMediabunnyAdapterOptions, MediabunnyAdapter } from '#mediabunny-adapter/types';
import {
  MediabunnyAudioRuntime,
  stopControllerAudio,
  syncAudioClip,
} from '#mediabunny-adapter/internal/audioRuntime';
import {
  MediabunnySourceControllerLifecycle,
  type MediabunnySourceController,
  toLogicalSourceSeconds,
  toMediaSeconds,
} from '#mediabunny-adapter/internal/sourceController';
import {
  assertValidMediabunnyVolume,
  MediabunnySourceLifecycle,
  type MediabunnySourceLoadToken,
  validateSources,
} from '#mediabunny-adapter/internal/sourceLifecycle';
import {
  getTimelinePlaybackSeconds,
  MediabunnyTransportClock,
  setTimelineClock,
} from '#mediabunny-adapter/internal/transportClock';
import {
  cancelVideoPlayback,
  clearPreviewCanvas,
  invalidateFrameRendering,
  type MediabunnyOutputOperationToken,
  MediabunnyVideoOutput,
  renderActiveVideoFrame,
  syncActiveVideoPlaybackFrame,
} from '#mediabunny-adapter/internal/videoOutput';

/**
 * Format a timeline or source-media time value for Mediabunny adapter status text.
 *
 * @param seconds - Timeline or source-media time in decimal seconds.
 */
export function formatMediabunnyTime(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return '0.00s';
  }

  return `${seconds.toFixed(2)}s`;
}

/**
 * Create a Mediabunny adapter that drives Canvas Timeline media playback.
 *
 * @remarks
 *
 * Source definitions are registered immediately but opened only when active or
 * explicitly preloaded. The adapter owns inputs created from URLs, blobs, and
 * factories, while supplied `{ kind: "input" }` values and caller-provided
 * `AudioContext` instances remain caller-owned.
 *
 * @param options - Mediabunny sources, preview canvas, audio, loader, and change callback.
 * @returns Imperative lazy-loading adapter and framework-neutral sync contract.
 *
 * @example
 * ```ts
 * import * as mediabunny from 'mediabunny';
 * import { createMediabunnyAdapter } from '@techsquidtv/canvas-timeline-mediabunny-adapter';
 *
 * const adapter = createMediabunnyAdapter({
 *   mediabunny,
 *   canvas,
 *   sources: [{ sourceId: 'source-1', input: '/media/interview.mp4' }],
 * });
 *
 * await adapter.preloadSource('source-1');
 * ```
 *
 * @see {@link MediabunnyAdapter}
 * @see {@link https://canvastimeline.com/docs/media-adapters | Media adapter guide}
 */
export function createMediabunnyAdapter(
  options: CreateMediabunnyAdapterOptions
): MediabunnyAdapter {
  validateSources(options.sources);
  if (options.audio?.destination !== undefined && options.audio.context === undefined) {
    throw new Error('An audio context is required when an audio destination is provided.');
  }
  const initialVolume = options.audio?.volume ?? 0.7;
  assertValidMediabunnyVolume(initialVolume);
  let disposed = false;
  const notify = () => {
    if (!disposed) {
      options.onChange?.();
    }
  };
  const transportClock = new MediabunnyTransportClock();
  const videoOutput = new MediabunnyVideoOutput(options.canvas ?? null, () => !disposed);
  const controllerLifecycle = new MediabunnySourceControllerLifecycle({
    getPlaybackSeconds: getTimelinePlaybackSeconds,
    cancelVideoPlayback: (controller) => {
      void cancelVideoPlayback(controller);
    },
    stopAudio: stopControllerAudio,
    invalidateFrameRendering,
  });
  const visualTrackKinds = new Set(options.visualTrackKinds ?? ['visual']);
  const audioTrackKinds = new Set(options.audioTrackKinds ?? ['audio']);

  const beginOutputOperation = (
    sourceIds: Iterable<string> = sourceLifecycle.activeSourceValues()
  ): MediabunnyOutputOperationToken => videoOutput.begin(sourceIds);

  const completeOutputOperation = (token: MediabunnyOutputOperationToken) =>
    videoOutput.complete(token);

  const isCurrentOutputOperation = (token: MediabunnyOutputOperationToken) =>
    videoOutput.isCurrent(token);

  const isCurrentActiveSourceOwnership = (
    outputToken: MediabunnyOutputOperationToken,
    ownership: readonly MediabunnySourceLoadToken[]
  ) =>
    !disposed &&
    isCurrentOutputOperation(outputToken) &&
    sourceLifecycle.isCurrentOwnership(ownership);

  const invalidateOutputOperations = (affectedSourceIds?: ReadonlySet<string>) => {
    if (!videoOutput.invalidate(affectedSourceIds, sourceLifecycle.activeSourceValues())) {
      return;
    }
    for (const controller of sourceLifecycle.controllerValues()) {
      invalidateFrameRendering(controller);
      void cancelVideoPlayback(controller);
    }
  };

  const assertAdapterActive = () => sourceLifecycle.assertActive();

  const setLastFrameTime = (timestamp: number | null) => videoOutput.setLastFrameTime(timestamp);

  const setStatus = (nextStatus: string) => sourceLifecycle.setStatus(nextStatus);

  const audioRuntime: MediabunnyAudioRuntime = new MediabunnyAudioRuntime(
    options.audio,
    initialVolume,
    transportClock,
    {
      isActive: () => !disposed,
      notify,
      controllerValues: (): Iterable<MediabunnySourceController> =>
        sourceLifecycle.controllerValues(),
    }
  );

  const getTransportClockTime = () => transportClock.getTime(audioRuntime.clockContext);

  const setTransportClock = (timelineSeconds: number, playbackRate: number, playing: boolean) => {
    transportClock.set(timelineSeconds, playbackRate, playing, audioRuntime.clockContext);
  };

  const ensureAudioRuntime = (notifyChange = true): ReturnType<MediabunnyAudioRuntime['ensure']> =>
    audioRuntime.ensure(notifyChange);

  const sourceLifecycle: MediabunnySourceLifecycle = new MediabunnySourceLifecycle(
    options.sources,
    () => (typeof options.mediabunny === 'function' ? options.mediabunny() : options.mediabunny),
    options.selectTracks,
    {
      ensureAudioRuntime,
      getTransportState: () => ({
        timelineSeconds: getTransportClockTime(),
        playbackRate: transportClock.playbackRate,
        playing: transportClock.playing,
      }),
      activatePendingAudioClock: () => audioRuntime.activatePendingClock(),
      stopController: (controller) => controllerLifecycle.stop(controller),
      disposeController: (controller) => controllerLifecycle.dispose(controller),
    },
    {
      invalidateOperations: invalidateOutputOperations,
      clearPreview: (controller) => {
        const canvas = videoOutput.canvas;
        if (canvas !== null) {
          clearPreviewCanvas(controller, canvas);
          setLastFrameTime(null);
        }
      },
      refreshPausedVisual: (sourceIds, supersedeInFlight) =>
        queuePausedActiveVisualRefresh(sourceIds, supersedeInFlight),
    },
    () => !disposed,
    notify
  );

  const getController = (activeClip: ActiveClip | undefined) => {
    if (activeClip === undefined) {
      return undefined;
    }

    return sourceLifecycle.getController(activeClip.clip.sourceId);
  };

  const setAllClocks = (timelineSeconds: number, playbackRate: number, playing: boolean) => {
    for (const controller of sourceLifecycle.controllerValues()) {
      setTimelineClock(controller, timelineSeconds, playbackRate);
      controller.playing = playing;
    }
  };

  const clearVideoSurface = () => {
    const canvas = videoOutput.canvas;
    if (canvas !== null) {
      const context = canvas.getContext('2d');
      if (context !== null) {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    setLastFrameTime(null);
  };

  const clearVideo = () => {
    if (disposed) {
      return;
    }
    invalidateOutputOperations();
    videoOutput.activeVisual = undefined;
    clearVideoSurface();
  };

  const renderVideoForOperation = async (
    activeVideo: ActiveClip,
    _timelineTime: RationalTime,
    outputToken: MediabunnyOutputOperationToken
  ) => {
    assertAdapterActive();
    if (!isCurrentOutputOperation(outputToken)) {
      return;
    }
    const controller = getController(activeVideo);
    const canvas = videoOutput.canvas;
    if (controller === undefined || canvas === null) {
      return;
    }

    const targetCanvas = canvas;
    try {
      await renderActiveVideoFrame(
        controller,
        targetCanvas,
        activeVideo,
        () =>
          isCurrentOutputOperation(outputToken) &&
          sourceLifecycle.getController(controller.sourceId) === controller,
        (timestamp) => {
          if (
            !isCurrentOutputOperation(outputToken) ||
            sourceLifecycle.getController(controller.sourceId) !== controller
          ) {
            return;
          }
          controller.lastRenderedVideoTimestamp = timestamp;
          setLastFrameTime(toLogicalSourceSeconds(controller, timestamp));
        }
      );
      if (
        !isCurrentOutputOperation(outputToken) ||
        sourceLifecycle.getController(controller.sourceId) !== controller
      ) {
        return;
      }
    } catch (renderError) {
      if (
        !isCurrentOutputOperation(outputToken) ||
        sourceLifecycle.getController(controller.sourceId) !== controller
      ) {
        return;
      }
      const error = renderError instanceof Error ? renderError : new Error(String(renderError));
      void sourceLifecycle.recoverSource(controller.sourceId, controller, error);
      throw error;
    }
  };

  const renderVideo = async (activeVideo: ActiveClip, timelineTime: RationalTime) => {
    assertAdapterActive();
    const outputToken = beginOutputOperation([activeVideo.clip.sourceId]);
    try {
      await renderVideoForOperation(activeVideo, timelineTime, outputToken);
      if (!isCurrentOutputOperation(outputToken)) {
        return;
      }
    } finally {
      completeOutputOperation(outputToken);
    }
  };

  const syncAudio = (activeAudio: ActiveClip | undefined) => {
    assertAdapterActive();
    const controller = getController(activeAudio);
    if (controller === undefined) {
      for (const sourceController of sourceLifecycle.controllerValues()) {
        syncAudioClip(sourceController, undefined);
      }
      return;
    }

    syncAudioClip(controller, activeAudio, (audioError) => {
      void sourceLifecycle.recoverSource(controller.sourceId, controller, audioError);
    });
  };

  const findActiveClipForKinds = (
    activeLayers: ActiveLayerResult<string>,
    trackKinds: ReadonlySet<string>
  ) => activeLayers.all.find((activeClip) => trackKinds.has(activeClip.track.kind));

  const stopInactiveControllerOutputs = async (
    activeVisual: ActiveClip | undefined,
    activeAudio: ActiveClip | undefined
  ) => {
    const activeVideoController = getController(activeVisual);
    const activeAudioController = getController(activeAudio);
    const videoCancellations: Promise<void>[] = [];

    for (const controller of sourceLifecycle.controllerValues()) {
      if (controller !== activeAudioController) {
        stopControllerAudio(controller);
      }
      if (controller !== activeVideoController) {
        videoCancellations.push(cancelVideoPlayback(controller));
      }
    }

    await Promise.all(videoCancellations);
  };

  const shouldSyncAudio = (
    reason: TimelineMediaSyncReason,
    activeAudio: ActiveClip | undefined
  ) => {
    if (reason !== 'tick') {
      return true;
    }

    if (activeAudio === undefined) {
      return [...sourceLifecycle.controllerValues()].some(
        (controller) => controller.activeAudioSyncKey !== undefined
      );
    }

    const controller = getController(activeAudio);
    return controller?.activeAudioSyncKey !== activeAudio.syncKey;
  };

  const ensureActiveSources = async (
    activeVisual: ActiveClip | undefined,
    activeAudio: ActiveClip | undefined,
    outputToken: MediabunnyOutputOperationToken
  ): Promise<readonly MediabunnySourceLoadToken[] | null> => {
    return sourceLifecycle.ensureSources(
      [activeVisual, activeAudio]
        .filter((activeClip): activeClip is ActiveClip => activeClip !== undefined)
        .map((activeClip) => activeClip.clip.sourceId),
      () => isCurrentOutputOperation(outputToken)
    );
  };

  function queuePausedActiveVisualRefresh(
    sourceIds: ReadonlySet<string>,
    supersedeInFlight = true
  ) {
    const expectedVisual = videoOutput.activeVisual;
    if (
      transportClock.playing ||
      videoOutput.canvas === null ||
      expectedVisual === undefined ||
      !sourceIds.has(expectedVisual.clip.sourceId)
    ) {
      return;
    }
    if (!supersedeInFlight && videoOutput.hasCurrentOperationInFlight()) {
      return;
    }

    const sourceId = expectedVisual.clip.sourceId;
    const outputToken = beginOutputOperation([sourceId]);
    void (async () => {
      try {
        const ownership = await sourceLifecycle.ensureSources([sourceId], () => {
          return (
            !disposed &&
            !transportClock.playing &&
            videoOutput.activeVisual === expectedVisual &&
            isCurrentOutputOperation(outputToken) &&
            sourceLifecycle.hasDefinition(sourceId)
          );
        });
        if (ownership === null) {
          return;
        }
        const controller = sourceLifecycle.getController(sourceId);
        if (
          controller === undefined ||
          transportClock.playing ||
          videoOutput.activeVisual !== expectedVisual ||
          !isCurrentActiveSourceOwnership(outputToken, ownership)
        ) {
          return;
        }

        await cancelVideoPlayback(controller);
        if (
          transportClock.playing ||
          videoOutput.activeVisual !== expectedVisual ||
          !isCurrentActiveSourceOwnership(outputToken, ownership)
        ) {
          return;
        }
        await renderVideoForOperation(expectedVisual, expectedVisual.timelineTime, outputToken);
      } finally {
        completeOutputOperation(outputToken);
      }
    })().catch(() => {
      // Source loads publish their failures and renderVideo owns runtime recovery.
    });
  }

  const syncLayers = async ({
    activeLayers,
    reason,
    timelineTime,
  }: TimelineLayerSyncDetails<string>) => {
    assertAdapterActive();
    const activeVisual = findActiveClipForKinds(activeLayers, visualTrackKinds);
    const activeAudio = findActiveClipForKinds(activeLayers, audioTrackKinds);
    const outputToken = beginOutputOperation(
      [activeVisual, activeAudio]
        .filter((activeClip): activeClip is ActiveClip => activeClip !== undefined)
        .map((activeClip) => activeClip.clip.sourceId)
    );
    try {
      const sourceOwnership = await ensureActiveSources(activeVisual, activeAudio, outputToken);
      if (
        sourceOwnership === null ||
        !isCurrentActiveSourceOwnership(outputToken, sourceOwnership)
      ) {
        return;
      }

      for (const activeClip of [activeVisual, activeAudio]) {
        if (activeClip === undefined) {
          continue;
        }
        const sourceState = sourceLifecycle.getState(activeClip.clip.sourceId);
        if (sourceState?.status === 'failed' && sourceState.error !== null) {
          throw sourceState.error;
        }
      }

      await stopInactiveControllerOutputs(activeVisual, activeAudio);
      if (!isCurrentActiveSourceOwnership(outputToken, sourceOwnership)) {
        return;
      }
      const pausedRateSynchronization = reason === 'rate' && !transportClock.playing;

      if (activeVisual !== undefined) {
        videoOutput.activeVisual = activeVisual;
        const controller = getController(activeVisual);
        const canvas = videoOutput.canvas;
        if (
          controller !== undefined &&
          canvas !== null &&
          !pausedRateSynchronization &&
          (reason === 'play' || reason === 'tick' || reason === 'rate')
        ) {
          syncActiveVideoPlaybackFrame(
            controller,
            canvas,
            activeVisual,
            () => isCurrentActiveSourceOwnership(outputToken, sourceOwnership),
            (timestamp) => {
              if (isCurrentActiveSourceOwnership(outputToken, sourceOwnership)) {
                setLastFrameTime(toLogicalSourceSeconds(controller, timestamp));
              }
            },
            (playbackError) => {
              if (isCurrentActiveSourceOwnership(outputToken, sourceOwnership)) {
                void sourceLifecycle.recoverSource(controller.sourceId, controller, playbackError);
              }
            }
          );
        } else {
          if (controller !== undefined) {
            await cancelVideoPlayback(controller);
            if (!isCurrentActiveSourceOwnership(outputToken, sourceOwnership)) {
              return;
            }
          }
          await renderVideoForOperation(activeVisual, timelineTime, outputToken);
          if (!isCurrentActiveSourceOwnership(outputToken, sourceOwnership)) {
            return;
          }
        }
      } else {
        videoOutput.activeVisual = undefined;
        clearVideoSurface();
      }

      if (reason === 'pause' || reason === 'gap' || pausedRateSynchronization) {
        for (const controller of sourceLifecycle.controllerValues()) {
          stopControllerAudio(controller);
        }
      } else if (shouldSyncAudio(reason, activeAudio)) {
        syncAudio(activeAudio);
      }

      if (!isCurrentActiveSourceOwnership(outputToken, sourceOwnership)) {
        return;
      }
      sourceLifecycle.replaceActiveSources(
        [activeVisual, activeAudio]
          .filter((activeClip): activeClip is ActiveClip => activeClip !== undefined)
          .map((activeClip) => activeClip.clip.sourceId)
      );
    } finally {
      completeOutputOperation(outputToken);
    }
  };

  const adapter: MediabunnyAdapter = {
    get ready() {
      return sourceLifecycle.ready;
    },
    get status() {
      return sourceLifecycle.status;
    },
    get error() {
      return sourceLifecycle.error;
    },
    get lastFrameTime() {
      return videoOutput.lastFrameTime;
    },
    get sourceStateById() {
      return sourceLifecycle.sourceStateById;
    },
    get volume() {
      return audioRuntime.volume;
    },
    get muted() {
      return audioRuntime.muted;
    },
    get audioStatus() {
      return audioRuntime.status;
    },
    subscribeFrame: (listener) => {
      assertAdapterActive();
      return videoOutput.subscribe(listener);
    },
    setCanvas: (nextCanvas) => {
      assertAdapterActive();
      if (videoOutput.canvas === nextCanvas) {
        return;
      }
      invalidateOutputOperations();
      videoOutput.setCanvas(nextCanvas);
      const activeVisual = videoOutput.activeVisual;
      if (nextCanvas !== null && !transportClock.playing && activeVisual !== undefined) {
        void renderVideo(activeVisual, activeVisual.timelineTime).catch(() => {
          // renderVideo owns recovery; canvas replacement is a best-effort refresh.
        });
      }
    },
    getClockTime: getTransportClockTime,
    startClock: (timelineTime, playbackRate) => {
      assertAdapterActive();
      const activeSourceIds = [...sourceLifecycle.activeSourceValues()];
      if (
        !sourceLifecycle.ready ||
        activeSourceIds.length === 0 ||
        activeSourceIds.some((sourceId) => !sourceLifecycle.hasController(sourceId))
      ) {
        return false;
      }

      setTransportClock(toSeconds(timelineTime), playbackRate, true);
      setAllClocks(toSeconds(timelineTime), playbackRate, true);
      return true;
    },
    stopClock: () => {
      if (disposed) {
        return;
      }
      const timelineSeconds = getTransportClockTime();
      setTransportClock(timelineSeconds, transportClock.playbackRate, false);
      audioRuntime.cancelPendingActivation();
      for (const controller of sourceLifecycle.controllerValues()) {
        controllerLifecycle.stop(controller);
      }
    },
    requestClockActivation: (playbackRate) => {
      assertAdapterActive();
      audioRuntime.requestClockActivation(playbackRate);
    },
    setVolume: (nextVolume) => {
      assertAdapterActive();
      assertValidMediabunnyVolume(nextVolume);
      audioRuntime.setVolume(nextVolume);
      notify();
    },
    setMuted: (nextMuted) => {
      assertAdapterActive();
      audioRuntime.setMuted(nextMuted);
      notify();
    },
    setSources: (sources) => sourceLifecycle.setSources(sources),
    preloadSource: (sourceId) => sourceLifecycle.preloadSource(sourceId),
    unloadSource: (sourceId) => sourceLifecycle.unloadSource(sourceId),
    retrySource: (sourceId) => sourceLifecycle.retrySource(sourceId),
    replaceSource: (source) => sourceLifecycle.replaceSource(source),
    setClockRate: (playbackRate) => {
      assertAdapterActive();
      const timelineSeconds = getTransportClockTime();
      audioRuntime.updatePendingActivationRate(playbackRate);
      setTransportClock(timelineSeconds, playbackRate, transportClock.playing);
      setAllClocks(timelineSeconds, playbackRate, transportClock.playing);
    },
    seek: async (timelineTime, activeLayers) => {
      assertAdapterActive();
      if (!sourceLifecycle.ready) {
        return;
      }

      const activeVisual = findActiveClipForKinds(activeLayers, visualTrackKinds);
      const activeAudio = findActiveClipForKinds(activeLayers, audioTrackKinds);
      const outputToken = beginOutputOperation(
        [activeVisual, activeAudio]
          .filter((activeClip): activeClip is ActiveClip => activeClip !== undefined)
          .map((activeClip) => activeClip.clip.sourceId)
      );
      try {
        const sourceOwnership = await ensureActiveSources(activeVisual, activeAudio, outputToken);
        if (
          sourceOwnership === null ||
          !isCurrentActiveSourceOwnership(outputToken, sourceOwnership)
        ) {
          return;
        }

        for (const controller of sourceLifecycle.controllerValues()) {
          stopControllerAudio(controller);
        }
        await Promise.all([...sourceLifecycle.controllerValues()].map(cancelVideoPlayback));
        if (!isCurrentActiveSourceOwnership(outputToken, sourceOwnership)) {
          return;
        }
        setTransportClock(toSeconds(timelineTime), transportClock.playbackRate, false);
        setAllClocks(toSeconds(timelineTime), transportClock.playbackRate, false);
        if (activeVisual !== undefined) {
          videoOutput.activeVisual = activeVisual;
          await renderVideoForOperation(activeVisual, timelineTime, outputToken);
          if (!isCurrentActiveSourceOwnership(outputToken, sourceOwnership)) {
            return;
          }
        } else {
          videoOutput.activeVisual = undefined;
          clearVideoSurface();
        }

        if (activeVisual === undefined) {
          setStatus(
            activeAudio ? 'Audio-only region at playhead.' : 'No active content at playhead.'
          );
        } else {
          setStatus(
            activeAudio
              ? 'Ready. Visuals and audio are mapped from separate timeline clips.'
              : 'Ready. Visual content is active; audio starts at its own clip offset.'
          );
        }

        if (!isCurrentActiveSourceOwnership(outputToken, sourceOwnership)) {
          return;
        }
        sourceLifecycle.replaceActiveSources(
          [activeVisual, activeAudio]
            .filter((activeClip): activeClip is ActiveClip => activeClip !== undefined)
            .map((activeClip) => activeClip.clip.sourceId)
        );
      } finally {
        completeOutputOperation(outputToken);
      }
    },
    renderVideo,
    syncAudio,
    syncLayers,
    onStatus: (playbackStatus) => {
      if (playbackStatus === 'playing') {
        setStatus('Mediabunny is driving timeline media playback.');
      } else if (playbackStatus === 'content-gap') {
        setStatus('Reached the next content gap.');
      } else if (playbackStatus === 'paused') {
        setStatus('Paused. Timeline edits seek Mediabunny frames.');
      }
    },
    clearVideo,
    getFrame: async (activeVideo) => {
      assertAdapterActive();
      const controller = getController(activeVideo);
      if (controller === undefined || controller.videoSink === null) {
        return null;
      }

      let wrappedCanvas: Awaited<ReturnType<Mediabunny.CanvasSink['getCanvas']>>;
      try {
        wrappedCanvas = await controller.videoSink.getCanvas(
          toMediaSeconds(controller, toSeconds(activeVideo.sourceTime))
        );
      } catch (frameError) {
        const error = frameError instanceof Error ? frameError : new Error(String(frameError));
        void sourceLifecycle.recoverSource(controller.sourceId, controller, error);
        return null;
      }
      if (
        wrappedCanvas === null ||
        disposed ||
        sourceLifecycle.getController(controller.sourceId) !== controller
      ) {
        return null;
      }

      return {
        canvas: wrappedCanvas.canvas,
        timestamp: toLogicalSourceSeconds(controller, wrappedCanvas.timestamp),
      };
    },
    dispose: () => {
      if (disposed) {
        return;
      }
      const terminalTimelineTime = getTransportClockTime();
      videoOutput.dispose();
      setTransportClock(terminalTimelineTime, transportClock.playbackRate, false);
      audioRuntime.dispose();
      sourceLifecycle.dispose();
      disposed = true;
    },
  };

  return adapter;
}
