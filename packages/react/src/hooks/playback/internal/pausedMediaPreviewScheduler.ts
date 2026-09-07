import type { MediaSynchronizationQueue } from '#react/hooks/playback/internal/mediaSynchronizationQueue';
import { toMediaError, withMediaCauseMessage } from '#react/hooks/playback/mediaError';
import { TimelineMediaError } from '@techsquidtv/canvas-timeline-core';
import type {
  ActiveLayerSelector,
  TimelineEngine,
  TimelineMediaSyncAdapter,
} from '@techsquidtv/canvas-timeline-core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
class PausedMediaPreviewScheduler {
  private frame: number | null = null;
  private generation = 0;

  cancel() {
    this.generation += 1;
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }

  isCurrent(generation: number) {
    return this.generation === generation;
  }

  schedule(run: (generation: number) => void) {
    if (this.frame !== null) {
      return;
    }

    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.generation += 1;
      run(this.generation);
    });
  }
}

interface UsePausedMediaPreviewOptions<LayerName extends string> {
  engine: TimelineEngine;
  adapter: TimelineMediaSyncAdapter<LayerName>;
  adapterIdentity: object | undefined;
  layers: Record<LayerName, ActiveLayerSelector>;
  ready: boolean;
  playing: boolean;
  hasPendingPlaybackStart: () => boolean;
  operationQueue: MediaSynchronizationQueue;
  onError?: (error: TimelineMediaError) => void;
}

interface PausedMediaPreviewSynchronization {
  cancel: () => void;
  schedule: () => void;
  resetForAdapter: (shouldPrime: boolean) => void;
}

export function usePausedMediaPreviewSynchronization<LayerName extends string>({
  engine,
  adapter,
  adapterIdentity,
  layers,
  ready,
  playing,
  hasPendingPlaybackStart,
  operationQueue,
  onError,
}: UsePausedMediaPreviewOptions<LayerName>): PausedMediaPreviewSynchronization {
  const adapterRef = useRef(adapter);
  const adapterIdentityRef = useRef(adapterIdentity);
  const layersRef = useRef(layers);
  const readyRef = useRef(ready);
  const playingRef = useRef(playing);
  const onErrorRef = useRef(onError);
  const primedRef = useRef(false);
  const layerSelectionRef = useRef<{ engine: TimelineEngine; signature: string } | null>(null);
  const [scheduler] = useState(() => new PausedMediaPreviewScheduler());

  useEffect(() => {
    adapterRef.current = adapter;
    adapterIdentityRef.current = adapterIdentity;
    layersRef.current = layers;
    readyRef.current = ready;
    playingRef.current = playing;
    onErrorRef.current = onError;
  }, [adapter, adapterIdentity, layers, onError, playing, ready]);

  const cancel = useCallback(() => {
    scheduler.cancel();
  }, [scheduler]);

  const canSeek = useCallback(
    () =>
      !hasPendingPlaybackStart() &&
      readyRef.current &&
      !playingRef.current &&
      adapterRef.current.seek !== undefined,
    [hasPendingPlaybackStart]
  );

  const schedule = useCallback(() => {
    if (!canSeek()) {
      return;
    }
    scheduler.schedule((generation) => {
      if (!canSeek()) {
        return;
      }

      const timelineTime = engine.getTime();
      const activeLayers = engine.media.getActiveLayers({
        time: timelineTime,
        layers: layersRef.current,
      });
      const operationToken = operationQueue.capture(adapterIdentityRef.current);
      void operationQueue.enqueue(async () => {
        if (
          !scheduler.isCurrent(generation) ||
          !operationQueue.isCurrent(operationToken, adapterIdentityRef.current) ||
          !canSeek()
        ) {
          return;
        }
        const currentAdapter = adapterRef.current;
        try {
          await currentAdapter.seek?.(timelineTime, activeLayers);
        } catch (seekError) {
          if (
            !scheduler.isCurrent(generation) ||
            !operationQueue.isCurrent(operationToken, adapterIdentityRef.current) ||
            !canSeek()
          ) {
            return;
          }
          const cause = toMediaError(seekError);
          onErrorRef.current?.(
            new TimelineMediaError(
              'seek-failed',
              withMediaCauseMessage('Media seek failed.', cause),
              { cause }
            )
          );
        }
      });
    });
  }, [canSeek, engine, operationQueue, scheduler]);

  useEffect(() => {
    if (!canSeek()) {
      return;
    }
    const activeLayers = engine.media.getActiveLayers({ layers });
    const signature = JSON.stringify(
      (Object.keys(activeLayers.layers) as LayerName[]).map((name) => [
        name,
        activeLayers.layers[name].map((entry) => entry.syncKey),
      ])
    );
    const previous = layerSelectionRef.current;
    layerSelectionRef.current = { engine, signature };
    if (previous && (previous.engine !== engine || previous.signature !== signature)) {
      schedule();
    }
  }, [canSeek, engine, layers, playing, ready, schedule]);

  useEffect(() => {
    const unsubscribers = [
      engine.on('playhead:scrub', schedule),
      engine.on('content:change', schedule),
      engine.on('playback:state', (nextPlaying) => {
        playingRef.current = nextPlaying;
        if (nextPlaying) {
          cancel();
        } else {
          schedule();
        }
      }),
    ];

    return () => {
      cancel();
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, [cancel, engine, schedule]);

  useEffect(() => {
    if (!ready || adapter.seek === undefined) {
      primedRef.current = false;
      return;
    }
    if (primedRef.current) {
      return;
    }
    primedRef.current = true;
    schedule();
  }, [adapter.seek, ready, schedule]);

  const resetForAdapter = useCallback(
    (shouldPrime: boolean) => {
      primedRef.current = shouldPrime;
      cancel();
      if (shouldPrime && !engine.getState().playing) {
        schedule();
      }
    },
    [cancel, engine, schedule]
  );

  return useMemo(
    () => ({ cancel, schedule, resetForAdapter }),
    [cancel, resetForAdapter, schedule]
  );
}
