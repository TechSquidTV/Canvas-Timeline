import type {
  TimelineKeyframeRenderClip,
  TimelineKeyframeRenderGeometry,
  TimelineRulerLabelFormat,
  TimelineRulerTickOptions,
  TimelineState,
} from '@techsquidtv/canvas-timeline-core';
import type { TimelineRendererTheme, TimelineRendererThemeInput } from '#renderer/theme';

/**
 * Optional ruler behavior for canvas-painted timeline ticks and labels.
 */
export type TimelineRulerOptions = Pick<
  TimelineRulerTickOptions,
  'frameRate' | 'labelFormat' | 'minimumMajorTickSpacing' | 'timecodeFormatOptions'
>;

export type { TimelineRulerLabelFormat };

/**
 * Toggles optional canvas feedback overlays that may be paired with separate interactive layers.
 */
export interface TimelineRenderOptions {
  /** Draw magnetic snapping guide lines. */
  showSnapLines?: boolean;
  /** Draw cross-track clip drop feedback on the canvas layer. */
  showClipDropFeedback?: boolean;
  /** Draw the in/out range fill on the canvas layer. */
  showInOutPoints?: boolean;
  /** Draw canvas-painted in/out boundary lines for renderer-only compositions. */
  showInOutBoundaryLines?: boolean;

  /** Draw built-in clip bodies and labels on the canvas layer. */
  showClips?: boolean;
  /** Draw text labels inside visible clips. */
  showClipLabels?: boolean;
  /** Draw keyframe curves and handles inside visible clips. */
  showKeyframes?: boolean;
  /** Core-prepared keyframe geometry drawn when `showKeyframes` is true. */
  keyframeGeometry?: TimelineKeyframeRenderGeometry;
  /** Draw text labels on ruler ticks. */
  showRulerLabels?: boolean;
  /** Optional ruler tick and label configuration. */
  ruler?: TimelineRulerOptions;
  /** Serializable renderer theme used for canvas-painted timeline visuals. */
  theme?: TimelineRendererThemeInput;
}

export type ResolvedTimelineRenderOptions = Required<
  Omit<TimelineRenderOptions, 'theme' | 'ruler' | 'keyframeGeometry'>
> & {
  ruler?: TimelineRulerOptions;
  keyframeGeometry?: TimelineKeyframeRenderGeometry;
  theme: TimelineRendererTheme;
};

export type RenderContext = {
  ctx: OffscreenCanvasRenderingContext2D;
  state: TimelineState;
  width: number;
  height: number;
  options: ResolvedTimelineRenderOptions;
  keyframeGeometryByClip?: ReadonlyMap<string, TimelineKeyframeRenderClip>;
  theme: TimelineRendererTheme;
};
