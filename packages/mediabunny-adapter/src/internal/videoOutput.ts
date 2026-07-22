import type { ActiveClip } from '@techsquidtv/canvas-timeline-core';
import { toSeconds } from '@techsquidtv/canvas-timeline-utils';
import type * as Mediabunny from 'mediabunny';
import {
  type MediabunnySourceController,
  type PendingFrameRequest,
  toMediaSeconds,
} from '#mediabunny-adapter/internal/sourceController';

export async function renderActiveVideoFrame(
  controller: MediabunnySourceController,
  canvas: HTMLCanvasElement,
  video: ActiveClip,
  isCurrent: () => boolean,
  onFrame?: (timestamp: number) => void
) {
  await renderFrameAt(
    controller,
    canvas,
    toMediaSeconds(controller, toSeconds(video.sourceTime)),
    isCurrent,
    onFrame
  );
}

const VIDEO_TIMESTAMP_EPSILON = 1e-9;

export async function cancelVideoPlayback(controller: MediabunnySourceController) {
  const iterator = resetVideoPlayback(controller);

  if (iterator !== null) {
    try {
      await iterator.return();
    } catch {
      // Cancellation should not surface decoder teardown errors.
    }
  }
}

function resetVideoPlayback(controller: MediabunnySourceController) {
  const iterator = controller.videoPlaybackIterator;
  controller.videoPlaybackGeneration += 1;
  controller.videoPlaybackIterator = null;
  controller.videoPlaybackFutureFrame = null;
  controller.videoPlaybackProcessing = false;
  controller.videoPlaybackEnded = false;
  controller.videoPlaybackSyncKey = undefined;
  controller.videoPlaybackSourceSeconds = null;
  controller.videoPlaybackTargetSeconds = null;
  controller.videoPlaybackCanvas = null;
  controller.videoPlaybackIsCurrent = undefined;
  controller.videoPlaybackOnFrame = undefined;
  controller.videoPlaybackOnFailure = undefined;
  return iterator;
}

async function processVideoPlayback(controller: MediabunnySourceController, generation: number) {
  if (
    controller.videoPlaybackProcessing ||
    controller.videoPlaybackEnded ||
    controller.videoPlaybackIterator === null
  ) {
    return;
  }

  controller.videoPlaybackProcessing = true;
  try {
    while (controller.videoPlaybackGeneration === generation) {
      if (controller.videoPlaybackIsCurrent?.() === false) {
        return;
      }
      const targetSeconds = controller.videoPlaybackTargetSeconds;
      const canvas = controller.videoPlaybackCanvas;
      if (targetSeconds === null || canvas === null) {
        return;
      }

      let newestDueFrame: Mediabunny.WrappedCanvas | null = null;
      while (controller.videoPlaybackGeneration === generation) {
        if (controller.videoPlaybackFutureFrame === null) {
          const iterator = controller.videoPlaybackIterator;
          if (iterator === null || controller.videoPlaybackEnded) {
            break;
          }

          const result = await iterator.next();
          if (controller.videoPlaybackGeneration !== generation) {
            return;
          }
          if (result.done) {
            controller.videoPlaybackEnded = true;
            break;
          }
          controller.videoPlaybackFutureFrame = result.value;
          if (controller.videoPlaybackIsCurrent?.() === false) {
            return;
          }
        }

        const latestTargetSeconds = controller.videoPlaybackTargetSeconds ?? targetSeconds;
        if (
          controller.videoPlaybackFutureFrame.timestamp >
          latestTargetSeconds + VIDEO_TIMESTAMP_EPSILON
        ) {
          break;
        }

        newestDueFrame = controller.videoPlaybackFutureFrame;
        controller.videoPlaybackFutureFrame = null;
      }

      if (
        newestDueFrame !== null &&
        controller.videoPlaybackIsCurrent?.() !== false &&
        !Object.is(newestDueFrame.timestamp, controller.lastRenderedVideoTimestamp) &&
        paintWrappedCanvas(canvas, newestDueFrame)
      ) {
        controller.lastRenderedVideoTimestamp = newestDueFrame.timestamp;
        controller.videoPlaybackOnFrame?.(newestDueFrame.timestamp);
      }

      if (Object.is(targetSeconds, controller.videoPlaybackTargetSeconds)) {
        return;
      }
    }
  } catch (decoderError) {
    if (controller.videoPlaybackGeneration === generation) {
      controller.videoPlaybackEnded = true;
      const error = decoderError instanceof Error ? decoderError : new Error(String(decoderError));
      controller.videoPlaybackOnFailure?.(error);
    }
  } finally {
    if (controller.videoPlaybackGeneration === generation) {
      controller.videoPlaybackProcessing = false;
    }
  }
}

async function startVideoPlayback(
  controller: MediabunnySourceController,
  canvas: HTMLCanvasElement,
  activeVideo: ActiveClip,
  isCurrent: () => boolean,
  onFrame?: (timestamp: number) => void,
  onFailure?: (error: Error) => void
) {
  const iterator = resetVideoPlayback(controller);
  const generation = controller.videoPlaybackGeneration;
  if (iterator !== null) {
    try {
      await iterator.return();
    } catch {
      // A new playback stream can still be created after teardown fails.
    }
  }
  if (controller.videoPlaybackGeneration !== generation) {
    return;
  }
  if (controller.videoSink === null) {
    return;
  }

  const sourceSeconds = toMediaSeconds(controller, toSeconds(activeVideo.sourceTime));
  controller.videoPlaybackIterator = controller.videoSink.canvases(
    sourceSeconds,
    toMediaSeconds(controller, toSeconds(activeVideo.sourceRange.end))
  );
  controller.videoPlaybackSyncKey = activeVideo.syncKey;
  controller.videoPlaybackSourceSeconds = sourceSeconds;
  controller.videoPlaybackTargetSeconds = sourceSeconds;
  controller.videoPlaybackCanvas = canvas;
  controller.videoPlaybackIsCurrent = isCurrent;
  controller.videoPlaybackOnFrame = onFrame;
  controller.videoPlaybackOnFailure = onFailure;
  void processVideoPlayback(controller, generation);
}

export function syncActiveVideoPlaybackFrame(
  controller: MediabunnySourceController,
  canvas: HTMLCanvasElement,
  activeVideo: ActiveClip,
  isCurrent: () => boolean,
  onFrame?: (timestamp: number) => void,
  onFailure?: (error: Error) => void
) {
  const sourceSeconds = toMediaSeconds(controller, toSeconds(activeVideo.sourceTime));
  if (
    controller.videoPlaybackIterator === null ||
    controller.videoPlaybackSyncKey !== activeVideo.syncKey ||
    (controller.videoPlaybackSourceSeconds !== null &&
      sourceSeconds + VIDEO_TIMESTAMP_EPSILON < controller.videoPlaybackSourceSeconds)
  ) {
    void startVideoPlayback(controller, canvas, activeVideo, isCurrent, onFrame, onFailure);
    return;
  }

  controller.videoPlaybackSourceSeconds = sourceSeconds;
  controller.videoPlaybackTargetSeconds = sourceSeconds;
  controller.videoPlaybackCanvas = canvas;
  controller.videoPlaybackIsCurrent = isCurrent;
  controller.videoPlaybackOnFrame = onFrame;
  controller.videoPlaybackOnFailure = onFailure;
  void processVideoPlayback(controller, controller.videoPlaybackGeneration);
}

export function clearPreviewCanvas(
  controller: MediabunnySourceController,
  canvas: HTMLCanvasElement
) {
  invalidateFrameRendering(controller);
  controller.lastRenderedVideoTimestamp = null;

  const context = canvas.getContext('2d');
  if (context !== null) {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }
}

export function invalidateFrameRendering(controller: MediabunnySourceController) {
  controller.asyncId += 1;
  controller.currentFrameRequest?.resolve();
  controller.pendingFrameRequest?.resolve();
  controller.currentFrameRequest = undefined;
  controller.pendingFrameRequest = undefined;
}

function renderFrameAt(
  controller: MediabunnySourceController,
  canvas: HTMLCanvasElement,
  sourceSeconds: number,
  isCurrent: () => boolean,
  onFrame?: (timestamp: number) => void
): Promise<void> {
  if (controller.videoSink === null) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const request: PendingFrameRequest = {
      canvas,
      sourceSeconds,
      isCurrent,
      resolve,
      reject,
      ...(onFrame !== undefined ? { onFrame } : {}),
    };

    if (controller.renderingFrame) {
      controller.pendingFrameRequest?.resolve();
      controller.pendingFrameRequest = request;
      return;
    }

    controller.renderingFrame = true;
    void processFrameRequests(controller, request);
  });
}

async function processFrameRequests(
  controller: MediabunnySourceController,
  initialRequest: PendingFrameRequest
) {
  let request: PendingFrameRequest | undefined = initialRequest;

  try {
    while (request !== undefined) {
      controller.pendingFrameRequest = undefined;
      controller.currentFrameRequest = request;
      const renderId = ++controller.asyncId;
      try {
        const wrappedCanvas = await controller.videoSink?.getCanvas(request.sourceSeconds);
        if (
          renderId === controller.asyncId &&
          wrappedCanvas !== null &&
          wrappedCanvas !== undefined &&
          request.isCurrent() &&
          paintWrappedCanvas(request.canvas, wrappedCanvas)
        ) {
          request.onFrame?.(wrappedCanvas.timestamp);
        }
        request.resolve();
      } catch (frameError) {
        if (renderId === controller.asyncId && request.isCurrent()) {
          request.reject(frameError instanceof Error ? frameError : new Error(String(frameError)));
        } else {
          request.resolve();
        }
      }
      if (controller.currentFrameRequest === request) {
        controller.currentFrameRequest = undefined;
      }
      request = controller.pendingFrameRequest;
    }
  } finally {
    controller.currentFrameRequest = undefined;
    controller.renderingFrame = false;
  }
}

function paintWrappedCanvas(canvas: HTMLCanvasElement, wrappedCanvas: Mediabunny.WrappedCanvas) {
  const context = canvas.getContext('2d');
  if (context === null) {
    return false;
  }

  if (
    canvas.width !== wrappedCanvas.canvas.width ||
    canvas.height !== wrappedCanvas.canvas.height
  ) {
    canvas.width = wrappedCanvas.canvas.width;
    canvas.height = wrappedCanvas.canvas.height;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(wrappedCanvas.canvas, 0, 0);
  return true;
}
