import type { CanvasRendererStats } from '#renderer/CanvasRenderer';
import type { TimelineRenderOptions } from '#renderer/render/types';
import type { TimelineStateSnapshot } from '@techsquidtv/canvas-timeline-core';
export type CanvasRendererWorkerMessage =
  | {
      type: 'INIT';
      canvas: OffscreenCanvas;
      state: TimelineStateSnapshot;
      dpr?: number;
      options?: TimelineRenderOptions;
      keyframesRequested?: boolean;
      diagnosticsEnabled?: boolean;
    }
  | {
      type: 'UPDATE_STATE';
      state: Partial<TimelineStateSnapshot>;
      keyframeGeometry?: TimelineRenderOptions['keyframeGeometry'];
      keyframesRequested?: boolean;
    }
  | {
      type: 'UPDATE_OPTIONS';
      options?: TimelineRenderOptions;
      keyframesRequested?: boolean;
    }
  | {
      type: 'UPDATE_PLAYHEAD';
      time: TimelineStateSnapshot['playheadTime'];
    }
  | {
      type: 'RESIZE';
      width: number;
      height: number;
      dpr?: number;
      keyframeGeometry?: TimelineRenderOptions['keyframeGeometry'];
      keyframesRequested?: boolean;
    }
  | {
      type: 'SET_DIAGNOSTICS';
      enabled: boolean;
    };

interface CanvasRendererWorkerRenderError {
  message: string;
  name?: string;
  stack?: string;
}

export type CanvasRendererWorkerResponse =
  | {
      type: 'RENDER_STATS';
      stats: CanvasRendererStats;
    }
  | {
      type: 'RENDER_ERROR';
      error: CanvasRendererWorkerRenderError;
    };
