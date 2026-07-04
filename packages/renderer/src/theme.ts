/**
 * Makes every nested property in a type optional.
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/**
 * Core rendering theme settings used by the Offscreen Canvas Web Worker to draw the timeline grid.
 */
export interface TimelineRendererTheme {
  /** High performance theme colors mapped from editor panels. */
  colors: {
    /** Main timeline background canvas color. */
    background: string;
    /** Structural canvas border/separator color for major timeline regions. */
    border: string;

    /** Design metrics for the top scale/ruler area. */
    ruler: {
      bg: string;
      tick: string;
      text: string;
    };

    /** Track design specifications. */
    track: {
      divider: string;
      lockedOverlay: string;
    };

    /** Marker visual configuration. */
    marker: {
      fill: string;
      text: string;
    };

    /** Visual appearance specs for the clip elements. */
    clip: {
      bg: string;
      bgSelected: string;
      border: string;
      borderSelected: string;
      text: string;
      textSelected: string;
      focusRing: string;
    };

    /** Visual appearance specs for clip-scoped keyframes. */
    keyframe: {
      line: string;
      fill: string;
      fillSelected: string;
      stroke: string;
      strokeSelected: string;
    };

    /** Feedback guides such as alignment guidelines and in/out points. */
    feedback: {
      snapLine: string;
      inOutArea: string;
      inOutBorder: string;
      dropTarget: string;
      dropTargetInvalid: string;
      dropTargetBorder: string;
    };
  };

  /** Font definitions used inside Canvas 2D rendering contexts. */
  fonts: {
    ruler: string;
    clip: string;
  };

  /** Spacing, sizes, padding, and dimensional metrics (in pixels). */
  metrics: {
    borderWidth: number;
    rulerHeight: number;
    trackHeight: number;
    trackDividerWidth: number;
    clipRadius: number;
    clipInsetY: number;
    clipLabelPaddingX: number;
  };
}

/**
 * Partial renderer theme overrides merged with the built-in canvas defaults.
 */
export type TimelineRendererThemeInput = DeepPartial<TimelineRendererTheme>;

/**
 * Built-in renderer defaults. These values are serializable and safe to send to a Worker.
 */
export const defaultTimelineRendererTheme: TimelineRendererTheme = {
  colors: {
    background: '#18181b',
    border: '#3f3f46',
    ruler: {
      bg: '#27272a',
      tick: '#3f3f46',
      text: '#a1a1aa',
    },
    track: {
      divider: '#27272a',
      lockedOverlay: 'rgba(120, 120, 120, 0.08)',
    },
    marker: {
      fill: '#a1a1aa',
      text: '#a1a1aa',
    },
    clip: {
      bg: '#27272a',
      bgSelected: '#3f3f46',
      border: 'transparent',
      borderSelected: 'transparent',
      text: '#ffffff',
      textSelected: '#ffffff',
      focusRing: '#f59e0b',
    },
    keyframe: {
      line: 'rgba(255, 255, 255, 0.48)',
      fill: '#18181b',
      fillSelected: '#f59e0b',
      stroke: '#ffffff',
      strokeSelected: '#f59e0b',
    },
    feedback: {
      snapLine: '#a1a1aa',
      inOutArea: 'rgba(59, 130, 246, 0.18)',
      inOutBorder: '#3b82f6',
      dropTarget: 'rgba(59, 130, 246, 0.12)',
      dropTargetInvalid: 'rgba(239, 68, 68, 0.14)',
      dropTargetBorder: 'rgba(59, 130, 246, 0.42)',
    },
  },
  fonts: {
    ruler: '10px sans-serif',
    clip: '12px sans-serif',
  },
  metrics: {
    borderWidth: 2,
    rulerHeight: 32,
    trackHeight: 48,
    trackDividerWidth: 1,
    clipRadius: 2,
    clipInsetY: 0,
    clipLabelPaddingX: 8,
  },
};

/**
 * Creates a complete renderer theme from optional nested overrides.
 *
 * @param overrides - Nested renderer theme values to merge over the defaults.
 */
export function createTimelineRendererTheme(
  overrides: TimelineRendererThemeInput = {}
): TimelineRendererTheme {
  return {
    colors: {
      background: overrides.colors?.background ?? defaultTimelineRendererTheme.colors.background,
      border: overrides.colors?.border ?? defaultTimelineRendererTheme.colors.border,
      ruler: {
        bg: overrides.colors?.ruler?.bg ?? defaultTimelineRendererTheme.colors.ruler.bg,
        tick: overrides.colors?.ruler?.tick ?? defaultTimelineRendererTheme.colors.ruler.tick,
        text: overrides.colors?.ruler?.text ?? defaultTimelineRendererTheme.colors.ruler.text,
      },
      track: {
        divider:
          overrides.colors?.track?.divider ?? defaultTimelineRendererTheme.colors.track.divider,
        lockedOverlay:
          overrides.colors?.track?.lockedOverlay ??
          defaultTimelineRendererTheme.colors.track.lockedOverlay,
      },
      marker: {
        fill: overrides.colors?.marker?.fill ?? defaultTimelineRendererTheme.colors.marker.fill,
        text: overrides.colors?.marker?.text ?? defaultTimelineRendererTheme.colors.marker.text,
      },
      clip: {
        bg: overrides.colors?.clip?.bg ?? defaultTimelineRendererTheme.colors.clip.bg,
        bgSelected:
          overrides.colors?.clip?.bgSelected ?? defaultTimelineRendererTheme.colors.clip.bgSelected,
        border: overrides.colors?.clip?.border ?? defaultTimelineRendererTheme.colors.clip.border,
        borderSelected:
          overrides.colors?.clip?.borderSelected ??
          defaultTimelineRendererTheme.colors.clip.borderSelected,
        text: overrides.colors?.clip?.text ?? defaultTimelineRendererTheme.colors.clip.text,
        textSelected:
          overrides.colors?.clip?.textSelected ??
          defaultTimelineRendererTheme.colors.clip.textSelected,
        focusRing:
          overrides.colors?.clip?.focusRing ?? defaultTimelineRendererTheme.colors.clip.focusRing,
      },
      keyframe: {
        line: overrides.colors?.keyframe?.line ?? defaultTimelineRendererTheme.colors.keyframe.line,
        fill: overrides.colors?.keyframe?.fill ?? defaultTimelineRendererTheme.colors.keyframe.fill,
        fillSelected:
          overrides.colors?.keyframe?.fillSelected ??
          defaultTimelineRendererTheme.colors.keyframe.fillSelected,
        stroke:
          overrides.colors?.keyframe?.stroke ?? defaultTimelineRendererTheme.colors.keyframe.stroke,
        strokeSelected:
          overrides.colors?.keyframe?.strokeSelected ??
          defaultTimelineRendererTheme.colors.keyframe.strokeSelected,
      },

      feedback: {
        snapLine:
          overrides.colors?.feedback?.snapLine ??
          defaultTimelineRendererTheme.colors.feedback.snapLine,
        inOutArea:
          overrides.colors?.feedback?.inOutArea ??
          defaultTimelineRendererTheme.colors.feedback.inOutArea,
        inOutBorder:
          overrides.colors?.feedback?.inOutBorder ??
          defaultTimelineRendererTheme.colors.feedback.inOutBorder,
        dropTarget:
          overrides.colors?.feedback?.dropTarget ??
          defaultTimelineRendererTheme.colors.feedback.dropTarget,
        dropTargetInvalid:
          overrides.colors?.feedback?.dropTargetInvalid ??
          defaultTimelineRendererTheme.colors.feedback.dropTargetInvalid,
        dropTargetBorder:
          overrides.colors?.feedback?.dropTargetBorder ??
          defaultTimelineRendererTheme.colors.feedback.dropTargetBorder,
      },
    },
    fonts: {
      ruler: overrides.fonts?.ruler ?? defaultTimelineRendererTheme.fonts.ruler,
      clip: overrides.fonts?.clip ?? defaultTimelineRendererTheme.fonts.clip,
    },
    metrics: {
      borderWidth:
        overrides.metrics?.borderWidth ?? defaultTimelineRendererTheme.metrics.borderWidth,
      rulerHeight:
        overrides.metrics?.rulerHeight ?? defaultTimelineRendererTheme.metrics.rulerHeight,
      trackHeight:
        overrides.metrics?.trackHeight ?? defaultTimelineRendererTheme.metrics.trackHeight,
      trackDividerWidth:
        overrides.metrics?.trackDividerWidth ??
        defaultTimelineRendererTheme.metrics.trackDividerWidth,
      clipRadius: overrides.metrics?.clipRadius ?? defaultTimelineRendererTheme.metrics.clipRadius,
      clipInsetY: overrides.metrics?.clipInsetY ?? defaultTimelineRendererTheme.metrics.clipInsetY,
      clipLabelPaddingX:
        overrides.metrics?.clipLabelPaddingX ??
        defaultTimelineRendererTheme.metrics.clipLabelPaddingX,
    },
  };
}

const CSS_COLOR_VARIABLES = {
  background: ['--timeline-canvas-background', '--timeline-panel', '--background'],
  border: ['--timeline-border', '--border'],
  rulerBg: ['--timeline-ruler-background', '--timeline-panel-muted', '--muted'],
  rulerTick: ['--timeline-ruler-tick', '--muted-foreground'],
  rulerText: ['--timeline-ruler-text', '--muted-foreground'],
  trackDivider: ['--timeline-track-divider'],
  trackLockedOverlay: ['--timeline-track-locked-overlay'],
  markerFill: ['--timeline-marker', '--muted-foreground'],
  markerText: ['--timeline-marker-text', '--timeline-ruler-text', '--muted-foreground'],
  clipBg: ['--timeline-clip-background', '--accent'],
  clipBgSelected: ['--timeline-clip-background-selected', '--accent'],
  clipBorder: ['--timeline-clip-border'],
  clipBorderSelected: ['--timeline-clip-border-selected'],
  clipText: ['--timeline-clip-text', '--foreground'],
  clipTextSelected: ['--timeline-clip-text-selected', '--foreground'],
  clipFocusRing: ['--timeline-clip-focus-ring', '--primary', '--ring'],
  keyframeLine: ['--timeline-keyframe-line', '--muted-foreground'],
  keyframeFill: ['--timeline-keyframe-fill', '--timeline-panel', '--background'],
  keyframeFillSelected: ['--timeline-keyframe-fill-selected', '--timeline-clip-focus-ring'],
  keyframeStroke: ['--timeline-keyframe-stroke', '--foreground'],
  keyframeStrokeSelected: ['--timeline-keyframe-stroke-selected', '--timeline-clip-focus-ring'],
  snapLine: ['--timeline-snap-line', '--muted-foreground'],
  inOutArea: ['--timeline-inout-area', '--timeline-inout-accent', '--ring'],
  inOutBorder: ['--timeline-inout-border', '--timeline-inout-accent', '--ring'],
  dropTarget: ['--timeline-drop-target', '--timeline-inout-accent', '--ring'],
  dropTargetInvalid: ['--timeline-drop-target-invalid', '--destructive'],
  dropTargetBorder: ['--timeline-drop-target-border', '--timeline-drop-target'],
} as const;

const CSS_METRIC_VARIABLES = {
  borderWidth: ['--timeline-border-width'],
  trackDividerWidth: ['--timeline-track-divider-width'],
  clipRadius: ['--timeline-clip-radius'],
  clipInsetY: ['--timeline-clip-inset-y'],
  clipLabelPaddingX: ['--timeline-clip-label-padding-x'],
} as const;

function normalizeCssColor(element: Element, value: string) {
  const document = element.ownerDocument;
  if (!document?.createElement || typeof getComputedStyle !== 'function') {
    return null;
  }

  const probe = document.createElement('span');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.color = value;

  if (probe.style.color === '') {
    return null;
  }

  element.appendChild(probe);
  const resolvedColor = getComputedStyle(probe).color;
  probe.remove();

  return resolvedColor || probe.style.color || null;
}

function resolveCssColor(
  element: Element,
  styles: CSSStyleDeclaration,
  variables: readonly string[],
  fallback: string
) {
  for (const variable of variables) {
    const value = styles.getPropertyValue(variable).trim();
    if (value === '') {
      continue;
    }

    const color =
      normalizeCssColor(element, value) ||
      normalizeCssColor(element, `hsl(${value})`) ||
      normalizeCssColor(element, `oklch(${value})`);

    if (color) {
      return color;
    }
  }

  return fallback;
}

function resolveCssMetric(
  styles: CSSStyleDeclaration,
  variables: readonly string[],
  fallback: number
) {
  for (const variable of variables) {
    const value = styles.getPropertyValue(variable).trim();
    if (value === '') {
      continue;
    }

    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }

  return fallback;
}

/**
 * Resolves shadcn/CSS custom properties into a serializable renderer theme.
 *
 * CSS is read on the main thread only. The returned object can be passed through
 * postMessage to the worker without the worker touching DOM APIs.
 *
 * @param element - DOM element whose computed CSS variables define the theme.
 * @param overrides - Explicit theme values that override defaults and resolved CSS variables.
 */
export function resolveTimelineRendererThemeFromElement(
  element: Element | null | undefined,
  overrides: TimelineRendererThemeInput = {}
): TimelineRendererTheme {
  if (!element || typeof getComputedStyle !== 'function') {
    return createTimelineRendererTheme(overrides);
  }

  const styles = getComputedStyle(element);
  const cssTheme = createTimelineRendererTheme({
    colors: {
      background: resolveCssColor(
        element,
        styles,
        CSS_COLOR_VARIABLES.background,
        defaultTimelineRendererTheme.colors.background
      ),
      border: resolveCssColor(
        element,
        styles,
        CSS_COLOR_VARIABLES.border,
        defaultTimelineRendererTheme.colors.border
      ),
      ruler: {
        bg: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.rulerBg,
          defaultTimelineRendererTheme.colors.ruler.bg
        ),
        tick: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.rulerTick,
          defaultTimelineRendererTheme.colors.ruler.tick
        ),
        text: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.rulerText,
          defaultTimelineRendererTheme.colors.ruler.text
        ),
      },
      track: {
        divider: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.trackDivider,
          defaultTimelineRendererTheme.colors.track.divider
        ),
        lockedOverlay: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.trackLockedOverlay,
          defaultTimelineRendererTheme.colors.track.lockedOverlay
        ),
      },
      marker: {
        fill: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.markerFill,
          defaultTimelineRendererTheme.colors.marker.fill
        ),
        text: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.markerText,
          defaultTimelineRendererTheme.colors.marker.text
        ),
      },
      clip: {
        bg: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.clipBg,
          defaultTimelineRendererTheme.colors.clip.bg
        ),
        bgSelected: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.clipBgSelected,
          defaultTimelineRendererTheme.colors.clip.bgSelected
        ),
        border: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.clipBorder,
          defaultTimelineRendererTheme.colors.clip.border
        ),
        borderSelected: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.clipBorderSelected,
          defaultTimelineRendererTheme.colors.clip.borderSelected
        ),
        text: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.clipText,
          defaultTimelineRendererTheme.colors.clip.text
        ),
        textSelected: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.clipTextSelected,
          defaultTimelineRendererTheme.colors.clip.textSelected
        ),
        focusRing: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.clipFocusRing,
          defaultTimelineRendererTheme.colors.clip.focusRing
        ),
      },
      keyframe: {
        line: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.keyframeLine,
          defaultTimelineRendererTheme.colors.keyframe.line
        ),
        fill: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.keyframeFill,
          defaultTimelineRendererTheme.colors.keyframe.fill
        ),
        fillSelected: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.keyframeFillSelected,
          defaultTimelineRendererTheme.colors.keyframe.fillSelected
        ),
        stroke: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.keyframeStroke,
          defaultTimelineRendererTheme.colors.keyframe.stroke
        ),
        strokeSelected: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.keyframeStrokeSelected,
          defaultTimelineRendererTheme.colors.keyframe.strokeSelected
        ),
      },

      feedback: {
        snapLine: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.snapLine,
          defaultTimelineRendererTheme.colors.feedback.snapLine
        ),
        inOutArea: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.inOutArea,
          defaultTimelineRendererTheme.colors.feedback.inOutArea
        ),
        inOutBorder: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.inOutBorder,
          defaultTimelineRendererTheme.colors.feedback.inOutBorder
        ),
        dropTarget: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.dropTarget,
          defaultTimelineRendererTheme.colors.feedback.dropTarget
        ),
        dropTargetInvalid: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.dropTargetInvalid,
          defaultTimelineRendererTheme.colors.feedback.dropTargetInvalid
        ),
        dropTargetBorder: resolveCssColor(
          element,
          styles,
          CSS_COLOR_VARIABLES.dropTargetBorder,
          defaultTimelineRendererTheme.colors.feedback.dropTargetBorder
        ),
      },
    },
  });

  const fontMono = styles.getPropertyValue('--font-mono').trim() || 'monospace';
  const fontSans = styles.getPropertyValue('--font-sans').trim() || 'sans-serif';

  const cssRulerFont =
    styles.getPropertyValue('--timeline-font-ruler').trim() || `10px ${fontMono}`;
  const cssClipFont = styles.getPropertyValue('--timeline-font-clip').trim() || `12px ${fontSans}`;

  return createTimelineRendererTheme({
    ...cssTheme,
    ...overrides,
    colors: {
      ...cssTheme.colors,
      ...overrides.colors,
      ruler: { ...cssTheme.colors.ruler, ...overrides.colors?.ruler },
      track: { ...cssTheme.colors.track, ...overrides.colors?.track },
      marker: { ...cssTheme.colors.marker, ...overrides.colors?.marker },
      clip: { ...cssTheme.colors.clip, ...overrides.colors?.clip },
      keyframe: { ...cssTheme.colors.keyframe, ...overrides.colors?.keyframe },
      feedback: { ...cssTheme.colors.feedback, ...overrides.colors?.feedback },
    },
    fonts: {
      ruler: overrides.fonts?.ruler ?? cssRulerFont,
      clip: overrides.fonts?.clip ?? cssClipFont,
    },
    metrics: {
      ...cssTheme.metrics,
      borderWidth: resolveCssMetric(
        styles,
        CSS_METRIC_VARIABLES.borderWidth,
        cssTheme.metrics.borderWidth
      ),
      trackDividerWidth: resolveCssMetric(
        styles,
        CSS_METRIC_VARIABLES.trackDividerWidth,
        cssTheme.metrics.trackDividerWidth
      ),
      clipRadius: resolveCssMetric(
        styles,
        CSS_METRIC_VARIABLES.clipRadius,
        cssTheme.metrics.clipRadius
      ),
      clipInsetY: resolveCssMetric(
        styles,
        CSS_METRIC_VARIABLES.clipInsetY,
        cssTheme.metrics.clipInsetY
      ),
      clipLabelPaddingX: resolveCssMetric(
        styles,
        CSS_METRIC_VARIABLES.clipLabelPaddingX,
        cssTheme.metrics.clipLabelPaddingX
      ),
      ...overrides.metrics,
    },
  });
}

/**
 * List of aesthetic color presets available for custom clip colors.
 */
export const COLOR_PRESETS = [
  { value: '#ef4444', name: 'Crimson' },
  { value: '#f59e0b', name: 'Amber' },
  { value: '#10b981', name: 'Emerald' },
  { value: '#3b82f6', name: 'Sapphire' },
  { value: '#8b5cf6', name: 'Amethyst' },
  { value: '#ec4899', name: 'Rose' },
  { value: '#06b6d4', name: 'Cyan' },
  { value: '#333333', name: 'Slate' },
];

/**
 * Generates a random color value from the predefined list of aesthetic presets.
 * Used when creating new clips, markers, or dynamic color selections.
 *
 * @param seed - Numeric seed used to choose a stable preset.
 * @returns A HEX color string (e.g., '#ef4444').
 */
export function getPresetColor(seed: number) {
  const index = Math.abs(Math.floor(seed)) % COLOR_PRESETS.length;
  return COLOR_PRESETS[index].value;
}
