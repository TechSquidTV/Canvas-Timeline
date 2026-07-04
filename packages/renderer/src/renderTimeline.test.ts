import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { describe, expect, it } from 'vite-plus/test';
import { renderTimeline } from './renderTimeline';
import { defaultTimelineRendererTheme } from './theme';

type RecordedRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type RecordedFill = RecordedRect & {
  fillStyle: string;
};

type RecordedPathFill = Partial<RecordedRect> & {
  fillStyle: string;
};

type CanvasStyle = CanvasGradient | CanvasPattern | string;
type RecordedPathCommand = {
  type: 'moveTo' | 'lineTo' | 'bezierCurveTo';
  x: number;
  y: number;
  cp1x?: number;
  cp1y?: number;
  cp2x?: number;
  cp2y?: number;
};

function formatCanvasStyle(style: CanvasStyle): string {
  return typeof style === 'string' ? style : style.constructor.name;
}

function normalizeRect(x: number, y: number, width: number, height: number): RecordedRect {
  return {
    height: Math.abs(height),
    width: Math.abs(width),
    x: width < 0 ? x + width : x,
    y: height < 0 ? y + height : y,
  };
}

function intersectRects(a: RecordedRect, b: RecordedRect): RecordedRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const width = right - x;
  const height = bottom - y;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { height, width, x, y };
}

function unionRects(a: RecordedRect, b: RecordedRect): RecordedRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);

  return {
    height: bottom - y,
    width: right - x,
    x,
    y,
  };
}

class FakeCanvasContext {
  fillStyle: string | CanvasGradient | CanvasPattern = '';
  font = '';
  globalAlpha = 1;
  lineWidth = 1;
  strokeStyle: string | CanvasGradient | CanvasPattern = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  readonly fills: RecordedFill[] = [];
  readonly pathCommands: RecordedPathCommand[] = [];
  readonly pathFills: RecordedPathFill[] = [];
  readonly rects: RecordedRect[] = [];
  readonly strokes: Array<{ lineWidth: number; strokeStyle: string }> = [];
  readonly texts: Array<{ fillStyle: string; font: string; text: string; x: number; y: number }> =
    [];
  private readonly clipStack: Array<RecordedRect | null> = [];
  private currentClip: RecordedRect | null = null;
  private currentPath: RecordedRect | null = null;

  beginPath() {
    this.currentPath = null;
  }
  closePath() {}
  fill() {
    const pathBounds = this.currentPath ? this.applyClip(this.currentPath) : null;

    if (this.currentPath && !pathBounds) {
      return;
    }

    this.pathFills.push({
      fillStyle: formatCanvasStyle(this.fillStyle),
      ...pathBounds,
    });
  }
  fillText(text: string, x: number, y: number) {
    this.texts.push({
      fillStyle: formatCanvasStyle(this.fillStyle),
      font: this.font,
      text,
      x,
      y,
    });
  }
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
    this.pathCommands.push({ type: 'bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y });
  }
  lineTo(x: number, y: number) {
    this.pathCommands.push({ type: 'lineTo', x, y });
  }
  moveTo(x: number, y: number) {
    this.pathCommands.push({ type: 'moveTo', x, y });
  }
  rect(x: number, y: number, width: number, height: number) {
    this.rects.push({ height, width, x, y });
    this.addPathRect(x, y, width, height);
  }
  resetTransform() {}
  restore() {
    this.currentClip = this.clipStack.pop() ?? null;
  }
  roundRect(x: number, y: number, width: number, height: number) {
    this.addPathRect(x, y, width, height);
  }
  save() {
    this.clipStack.push(this.currentClip ? { ...this.currentClip } : null);
  }
  rotate() {}
  scale() {}
  translate() {}
  strokeRect() {}
  stroke() {
    const pathBounds = this.currentPath ? this.applyClip(this.currentPath) : null;

    if (this.currentPath && !pathBounds) {
      return;
    }

    this.strokes.push({
      lineWidth: this.lineWidth,
      strokeStyle: formatCanvasStyle(this.strokeStyle),
    });
  }
  clip() {
    if (!this.currentPath) {
      return;
    }

    const nextClip = this.currentClip
      ? intersectRects(this.currentClip, this.currentPath)
      : this.currentPath;

    this.currentClip = nextClip ?? { height: 0, width: 0, x: 0, y: 0 };
  }

  fillRect(x: number, y: number, width: number, height: number) {
    const fillBounds = this.applyClip(normalizeRect(x, y, width, height));

    if (!fillBounds) {
      return;
    }

    this.fills.push({
      fillStyle: formatCanvasStyle(this.fillStyle),
      ...fillBounds,
    });
  }

  private addPathRect(x: number, y: number, width: number, height: number) {
    const rect = normalizeRect(x, y, width, height);
    this.currentPath = this.currentPath ? unionRects(this.currentPath, rect) : rect;
  }

  private applyClip(rect: RecordedRect) {
    return this.currentClip ? intersectRects(rect, this.currentClip) : rect;
  }
}

function createState() {
  return new TimelineEngine({
    duration: fromSeconds(15),
    playheadTime: fromSeconds(2),
    tracks: [],
    zoomScale: 50,
  }).getState();
}

function createStateWithContent() {
  const state = new TimelineEngine({
    duration: fromSeconds(15),
    playheadTime: fromSeconds(2),
    tracks: [
      {
        id: 'video-1',
        kind: 'visual',
        selected: false,
        locked: false,
        muted: false,
        visible: true,
        clips: [
          {
            id: 'clip-1',
            sourceId: 'source-1',
            timelineStart: fromSeconds(1),
            timelineEnd: fromSeconds(3),
            sourceStart: fromSeconds(0),
            selected: false,
            label: 'Clip 1',
          },
          {
            id: 'clip-2',
            sourceId: 'source-2',
            timelineStart: fromSeconds(4),
            timelineEnd: fromSeconds(6),
            sourceStart: fromSeconds(0),
            selected: true,
            label: 'Clip 2',
          },
        ],
      },
    ],
    zoomScale: 50,
  }).getState();
  state.inPoint = fromSeconds(1);
  state.outPoint = fromSeconds(8);
  state.snapFeedback = { lines: [3], target: null };

  return state;
}

function createStateWithLockedTrack() {
  return new TimelineEngine({
    duration: fromSeconds(15),
    tracks: [
      {
        id: 'locked-track',
        kind: 'visual',
        selected: false,
        locked: true,
        muted: false,
        visible: true,
        clips: [
          {
            id: 'locked-clip',
            sourceId: 'locked-source',
            timelineStart: fromSeconds(1),
            timelineEnd: fromSeconds(3),
            sourceStart: fromSeconds(0),
            selected: false,
            color: '#abcdef',
            label: 'Locked clip',
          },
        ],
      },
    ],
    zoomScale: 50,
  }).getState();
}

function createStateWithHoldKeyframes() {
  return new TimelineEngine({
    duration: fromSeconds(8),
    tracks: [
      {
        id: 'video-1',
        kind: 'visual',
        selected: false,
        locked: false,
        muted: false,
        visible: true,
        clips: [
          {
            id: 'hold-clip',
            sourceId: 'hold-source',
            timelineStart: fromSeconds(1),
            timelineEnd: fromSeconds(5),
            sourceStart: fromSeconds(0),
            selected: true,
            keyframes: [
              {
                id: 'hold-start',
                property: 'opacity',
                time: fromSeconds(1),
                value: 1,
                interpolation: 'hold',
              },
              {
                id: 'hold-middle',
                property: 'opacity',
                time: fromSeconds(3),
                value: 0.35,
                interpolation: 'linear',
              },
              {
                id: 'hold-end',
                property: 'opacity',
                time: fromSeconds(5),
                value: 0.75,
                interpolation: 'linear',
              },
            ],
          },
        ],
      },
    ],
    zoomScale: 50,
  }).getState();
}

function createStateWithBezierKeyframes() {
  return new TimelineEngine({
    duration: fromSeconds(8),
    tracks: [
      {
        id: 'video-1',
        kind: 'visual',
        selected: false,
        locked: false,
        muted: false,
        visible: true,
        clips: [
          {
            id: 'bezier-clip',
            sourceId: 'bezier-source',
            timelineStart: fromSeconds(1),
            timelineEnd: fromSeconds(5),
            sourceStart: fromSeconds(0),
            selected: true,
            keyframes: [
              {
                id: 'bezier-start',
                property: 'opacity',
                time: fromSeconds(1),
                value: 1,
                interpolation: 'bezier',
                easing: { x1: 0.2, y1: 0.8, x2: 0.8, y2: 0.2 },
              },
              {
                id: 'bezier-end',
                property: 'opacity',
                time: fromSeconds(5),
                value: 0.25,
                interpolation: 'linear',
              },
            ],
          },
        ],
      },
    ],
    zoomScale: 50,
  }).getState();
}

function createStateWithClippedTracks() {
  return new TimelineEngine({
    duration: fromSeconds(40),
    playheadTime: fromSeconds(2),
    tracks: [
      {
        id: 'visible-track',
        kind: 'visual',
        selected: false,
        locked: false,
        muted: false,
        visible: true,
        height: 40,
        clips: [
          {
            id: 'visible-clip',
            sourceId: 'visible-source',
            timelineStart: fromSeconds(0),
            timelineEnd: fromSeconds(2),
            sourceStart: fromSeconds(0),
            selected: false,
            color: '#111111',
            label: 'Visible',
          },
        ],
      },
      {
        id: 'partial-track',
        kind: 'visual',
        selected: false,
        locked: false,
        muted: false,
        visible: true,
        height: 40,
        clips: [
          {
            id: 'partial-clip',
            sourceId: 'partial-source',
            timelineStart: fromSeconds(0),
            timelineEnd: fromSeconds(2),
            sourceStart: fromSeconds(0),
            selected: false,
            color: '#222222',
            label: 'Partial',
          },
        ],
      },
      {
        id: 'offscreen-track',
        kind: 'visual',
        selected: false,
        locked: false,
        muted: false,
        visible: true,
        height: 40,
        clips: [
          {
            id: 'offscreen-clip',
            sourceId: 'offscreen-source',
            timelineStart: fromSeconds(0),
            timelineEnd: fromSeconds(2),
            sourceStart: fromSeconds(0),
            selected: false,
            color: '#333333',
            label: 'Offscreen',
          },
        ],
      },
    ],
    zoomScale: 10,
  }).getState();
}

describe('renderTimeline', () => {
  it('paints the full backing store when DPR creates fractional logical dimensions', () => {
    const ctx = new FakeCanvasContext();

    renderTimeline(
      ctx as unknown as OffscreenCanvasRenderingContext2D,
      { width: 1035, height: 517 } as OffscreenCanvas,
      createState(),
      2
    );

    expect(ctx.fills).toContainEqual(
      expect.objectContaining({
        fillStyle: defaultTimelineRendererTheme.colors.background,
        height: 258.5,
        width: 517.5,
      })
    );
  });

  it('clips partially visible tracks and culls fully offscreen tracks', () => {
    const ctx = new FakeCanvasContext();

    renderTimeline(
      ctx as unknown as OffscreenCanvasRenderingContext2D,
      { width: 400, height: 80 } as OffscreenCanvas,
      createStateWithClippedTracks(),
      1
    );

    expect(ctx.rects).toContainEqual(
      expect.objectContaining({
        height: 8,
        width: 400,
        x: 0,
        y: 72,
      })
    );
    expect(ctx.pathFills).toContainEqual(
      expect.objectContaining({ fillStyle: '#111111', height: 40, y: 32 })
    );
    expect(ctx.pathFills).toContainEqual(
      expect.objectContaining({ fillStyle: '#222222', height: 8, y: 72 })
    );
    expect(ctx.pathFills).not.toContainEqual(expect.objectContaining({ fillStyle: '#333333' }));
  });

  it('draws clip drop feedback lane fills when enabled', () => {
    const state = createStateWithContent();
    state.clipDropFeedback = {
      activeClipId: 'clip-1',
      sourceTrackId: 'video-1',
      hoveredTrackId: 'video-1',
      activeTargetTrackId: 'video-1',
      valid: true,
      reason: null,
      penetrationRatio: 1,
    };
    const ctx = new FakeCanvasContext();

    renderTimeline(
      ctx as unknown as OffscreenCanvasRenderingContext2D,
      { width: 800, height: 160 } as OffscreenCanvas,
      state,
      1
    );

    expect(ctx.fills).toContainEqual(
      expect.objectContaining({
        fillStyle: defaultTimelineRendererTheme.colors.feedback.dropTarget,
        y: defaultTimelineRendererTheme.metrics.rulerHeight,
      })
    );
    expect(ctx.fills).toContainEqual(
      expect.objectContaining({
        fillStyle: defaultTimelineRendererTheme.colors.feedback.dropTargetBorder,
      })
    );
  });

  it('draws hold keyframe interpolation as a step', () => {
    const ctx = new FakeCanvasContext();

    renderTimeline(
      ctx as unknown as OffscreenCanvasRenderingContext2D,
      { width: 400, height: 160 } as OffscreenCanvas,
      createStateWithHoldKeyframes(),
      1,
      { showClipLabels: false }
    );

    const lineCommands = ctx.pathCommands.filter((command) => command.type === 'lineTo');
    expect(lineCommands).toHaveLength(3);
    expect(lineCommands[0].x).toBe(lineCommands[1].x);
    expect(lineCommands[0].y).not.toBe(lineCommands[1].y);
  });

  it('draws bezier keyframe interpolation with cubic control points', () => {
    const ctx = new FakeCanvasContext();

    renderTimeline(
      ctx as unknown as OffscreenCanvasRenderingContext2D,
      { width: 400, height: 160 } as OffscreenCanvas,
      createStateWithBezierKeyframes(),
      1,
      { showClipLabels: false }
    );

    const bezierCommands = ctx.pathCommands.filter((command) => command.type === 'bezierCurveTo');
    expect(bezierCommands).toHaveLength(1);
    expect(bezierCommands[0].cp1x).toBeLessThan(bezierCommands[0].cp2x ?? 0);
    expect(bezierCommands[0].x).toBeGreaterThan(bezierCommands[0].cp2x ?? 0);
  });

  it('draws invalid hovered drop targets and can suppress built-in drop feedback', () => {
    const state = createStateWithContent();
    state.tracks.push({
      id: 'audio-1',
      kind: 'audio',
      selected: false,
      locked: false,
      muted: false,
      visible: true,
      clips: [],
    });
    state.clipDropFeedback = {
      activeClipId: 'clip-1',
      sourceTrackId: 'video-1',
      hoveredTrackId: 'audio-1',
      activeTargetTrackId: 'video-1',
      valid: false,
      reason: 'incompatible-track-kind',
      penetrationRatio: 0.5,
    };
    const ctx = new FakeCanvasContext();

    renderTimeline(
      ctx as unknown as OffscreenCanvasRenderingContext2D,
      { width: 800, height: 160 } as OffscreenCanvas,
      state,
      1
    );

    expect(ctx.fills).toContainEqual(
      expect.objectContaining({
        fillStyle: defaultTimelineRendererTheme.colors.feedback.dropTargetInvalid,
      })
    );

    const disabledCtx = new FakeCanvasContext();
    renderTimeline(
      disabledCtx as unknown as OffscreenCanvasRenderingContext2D,
      { width: 800, height: 160 } as OffscreenCanvas,
      state,
      1,
      { showClipDropFeedback: false }
    );

    expect(disabledCtx.fills).not.toContainEqual(
      expect.objectContaining({
        fillStyle: defaultTimelineRendererTheme.colors.feedback.dropTargetInvalid,
      })
    );
  });

  it('uses custom renderer theme values for canvas-painted timeline visuals', () => {
    const state = createStateWithContent();
    state.markers = [{ id: 'marker-1', time: fromSeconds(2), label: 'M1' }];
    const ctx = new FakeCanvasContext();

    renderTimeline(
      ctx as unknown as OffscreenCanvasRenderingContext2D,
      { width: 800, height: 160 } as OffscreenCanvas,
      state,
      1,
      {
        theme: {
          colors: {
            background: '#010203',
            border: '#020304',
            ruler: {
              bg: '#040506',
              tick: '#070809',
              text: '#0a0b0c',
            },
            track: {
              divider: '#0d0e0f',
              lockedOverlay: '#0e0f10',
            },
            marker: {
              fill: '#0f1011',
              text: '#121314',
            },
            clip: {
              bg: '#101112',
              bgSelected: '#131415',
              borderSelected: '#161718',
              text: '#191a1b',
              textSelected: '#1a1b1c',
            },

            feedback: {
              snapLine: '#222324',
              inOutArea: '#252627',
              inOutBorder: '#28292a',
            },
          },
          metrics: {
            borderWidth: 2,
            trackDividerWidth: 3,
          },
        },
      }
    );

    expect(ctx.fills).toContainEqual(expect.objectContaining({ fillStyle: '#010203' }));
    expect(ctx.fills).toContainEqual(
      expect.objectContaining({ fillStyle: '#020304', height: 2, y: 30 })
    );
    expect(ctx.fills).toContainEqual(expect.objectContaining({ fillStyle: '#040506' }));
    expect(ctx.fills).toContainEqual(
      expect.objectContaining({ fillStyle: '#0d0e0f', height: 3, y: 77 })
    );
    expect(ctx.fills).toContainEqual(expect.objectContaining({ fillStyle: '#252627' }));
    expect(ctx.fills).not.toContainEqual(expect.objectContaining({ fillStyle: '#28292a' }));

    expect(ctx.pathFills).toContainEqual(expect.objectContaining({ fillStyle: '#070809' }));
    expect(ctx.pathFills).toContainEqual(expect.objectContaining({ fillStyle: '#0f1011' }));
    expect(ctx.pathFills).toContainEqual(expect.objectContaining({ fillStyle: '#101112' }));
    expect(ctx.pathFills).toContainEqual(expect.objectContaining({ fillStyle: '#131415' }));
    expect(ctx.pathFills).toContainEqual(expect.objectContaining({ fillStyle: '#222324' }));
    expect(ctx.pathFills).not.toContainEqual(expect.objectContaining({ fillStyle: '#28292a' }));

    expect(ctx.strokes).toContainEqual(
      expect.objectContaining({ lineWidth: 2, strokeStyle: '#161718' })
    );
    expect(ctx.texts).toContainEqual(expect.objectContaining({ fillStyle: '#0a0b0c' }));
    expect(ctx.texts).toContainEqual(expect.objectContaining({ fillStyle: '#121314', text: 'M1' }));
    expect(ctx.texts).toContainEqual(expect.objectContaining({ fillStyle: '#191a1b' }));
    expect(ctx.texts).toContainEqual(expect.objectContaining({ fillStyle: '#1a1b1c' }));
  });

  it('draws canvas in/out boundary lines only when explicitly enabled', () => {
    const state = createStateWithContent();
    const defaultCtx = new FakeCanvasContext();

    renderTimeline(
      defaultCtx as unknown as OffscreenCanvasRenderingContext2D,
      { width: 800, height: 160 } as OffscreenCanvas,
      state,
      1,
      {
        theme: {
          colors: {
            feedback: {
              inOutBorder: '#28292a',
            },
          },
        },
      }
    );

    expect(defaultCtx.fills).not.toContainEqual(expect.objectContaining({ fillStyle: '#28292a' }));

    const boundaryCtx = new FakeCanvasContext();

    renderTimeline(
      boundaryCtx as unknown as OffscreenCanvasRenderingContext2D,
      { width: 800, height: 160 } as OffscreenCanvas,
      state,
      1,
      {
        showInOutBoundaryLines: true,
        theme: {
          colors: {
            feedback: {
              inOutBorder: '#28292a',
            },
          },
        },
      }
    );

    expect(boundaryCtx.fills).toContainEqual(expect.objectContaining({ fillStyle: '#28292a' }));
  });

  it('keeps clip.color ahead of theme clip backgrounds', () => {
    const state = createStateWithContent();
    state.tracks[0].clips[0].color = '#abcdef';
    const ctx = new FakeCanvasContext();

    renderTimeline(
      ctx as unknown as OffscreenCanvasRenderingContext2D,
      { width: 800, height: 160 } as OffscreenCanvas,
      state,
      1,
      {
        theme: {
          colors: {
            clip: {
              bg: '#101112',
            },
          },
        },
      }
    );

    expect(ctx.pathFills).toContainEqual(expect.objectContaining({ fillStyle: '#abcdef' }));
  });

  it('renders locked tracks as a themed row overlay without clip lock glyphs', () => {
    const ctx = new FakeCanvasContext();

    renderTimeline(
      ctx as unknown as OffscreenCanvasRenderingContext2D,
      { width: 800, height: 160 } as OffscreenCanvas,
      createStateWithLockedTrack(),
      1,
      {
        theme: {
          colors: {
            track: {
              lockedOverlay: '#112233',
            },
          },
        },
      }
    );

    expect(ctx.texts).not.toContainEqual(expect.objectContaining({ text: '🔒' }));
    expect(ctx.texts).toContainEqual(expect.objectContaining({ text: 'Locked clip' }));
    expect(ctx.pathFills).toContainEqual(expect.objectContaining({ fillStyle: '#abcdef' }));
    expect(ctx.fills).toContainEqual(
      expect.objectContaining({
        fillStyle: '#112233',
        height: 48,
        y: 32,
      })
    );
  });

  it('can hide built-in clip drawing while retaining other canvas visuals', () => {
    const ctx = new FakeCanvasContext();

    renderTimeline(
      ctx as unknown as OffscreenCanvasRenderingContext2D,
      { width: 800, height: 160 } as OffscreenCanvas,
      createStateWithContent(),
      1,
      {
        showClips: false,
        theme: {
          colors: {
            clip: {
              bg: '#101112',
              bgSelected: '#131415',
            },
          },
        },
      }
    );

    expect(ctx.pathFills).not.toContainEqual(expect.objectContaining({ fillStyle: '#101112' }));
    expect(ctx.pathFills).not.toContainEqual(expect.objectContaining({ fillStyle: '#131415' }));
    expect(ctx.texts).not.toContainEqual(expect.objectContaining({ text: 'Clip 1' }));
    expect(ctx.fills).toContainEqual(
      expect.objectContaining({ fillStyle: defaultTimelineRendererTheme.colors.background })
    );
  });

  it('uses renderer clip geometry metrics for clip body and label placement', () => {
    const ctx = new FakeCanvasContext();

    renderTimeline(
      ctx as unknown as OffscreenCanvasRenderingContext2D,
      { width: 800, height: 160 } as OffscreenCanvas,
      createStateWithContent(),
      1,
      {
        theme: {
          colors: {
            clip: {
              bg: '#101112',
            },
          },
          metrics: {
            clipInsetY: 4,
            clipLabelPaddingX: 12,
            clipRadius: 6,
          },
        },
      }
    );

    expect(ctx.pathFills).toContainEqual(
      expect.objectContaining({
        fillStyle: '#101112',
        height: 40,
        y: 36,
      })
    );
    expect(ctx.texts).toContainEqual(
      expect.objectContaining({
        text: 'Clip 1',
        x: 78,
        y: 56,
      })
    );
  });

  it('draws markers with the renderer theme fallback when marker color is omitted', () => {
    const state = createStateWithContent();
    state.markers = [{ id: 'marker-1', time: fromSeconds(2), label: 'M1' }];
    const ctx = new FakeCanvasContext();

    renderTimeline(
      ctx as unknown as OffscreenCanvasRenderingContext2D,
      { width: 800, height: 160 } as OffscreenCanvas,
      state,
      1,
      {
        theme: {
          colors: {
            marker: {
              fill: '#778899',
              text: '#99aabb',
            },
          },
        },
      }
    );

    expect(ctx.pathFills).toContainEqual(expect.objectContaining({ fillStyle: '#778899' }));
    expect(ctx.texts).toContainEqual(expect.objectContaining({ fillStyle: '#99aabb', text: 'M1' }));
  });

  it('keeps marker.color ahead of the renderer marker theme', () => {
    const state = createStateWithContent();
    state.markers = [{ id: 'marker-1', time: fromSeconds(2), label: 'M1', color: '#123456' }];
    const ctx = new FakeCanvasContext();

    renderTimeline(
      ctx as unknown as OffscreenCanvasRenderingContext2D,
      { width: 800, height: 160 } as OffscreenCanvas,
      state,
      1,
      {
        theme: {
          colors: {
            marker: {
              fill: '#778899',
            },
          },
        },
      }
    );

    expect(ctx.pathFills).toContainEqual(expect.objectContaining({ fillStyle: '#123456' }));
  });

  it('omits clip labels when clip label rendering is disabled', () => {
    const ctx = new FakeCanvasContext();

    renderTimeline(
      ctx as unknown as OffscreenCanvasRenderingContext2D,
      { width: 800, height: 160 } as OffscreenCanvas,
      createStateWithContent(),
      1,
      { showClipLabels: false }
    );

    expect(ctx.texts).not.toContainEqual(expect.objectContaining({ text: 'Clip 1' }));
    expect(ctx.texts).not.toContainEqual(expect.objectContaining({ text: 'Clip 2' }));
    expect(ctx.texts.length).toBeGreaterThan(0);
  });

  it('omits ruler labels when ruler label rendering is disabled', () => {
    const ctx = new FakeCanvasContext();

    renderTimeline(
      ctx as unknown as OffscreenCanvasRenderingContext2D,
      { width: 800, height: 160 } as OffscreenCanvas,
      createStateWithContent(),
      1,
      { showRulerLabels: false }
    );

    expect(ctx.texts).toEqual([
      expect.objectContaining({ text: 'Clip 1' }),
      expect.objectContaining({ text: 'Clip 2' }),
    ]);
  });

  it('dims hidden track rows without removing editor geometry', () => {
    const ctx = new FakeCanvasContext();
    const state = new TimelineEngine({
      duration: fromSeconds(15),
      tracks: [
        {
          id: 'hidden-track',
          kind: 'visual',
          selected: false,
          locked: false,
          muted: false,
          visible: false,
          clips: [
            {
              id: 'hidden-clip',
              sourceId: 'hidden-source',
              timelineStart: fromSeconds(1),
              timelineEnd: fromSeconds(3),
              sourceStart: fromSeconds(0),
              selected: false,
            },
          ],
        },
      ],
      zoomScale: 50,
    }).getState();

    renderTimeline(
      ctx as unknown as OffscreenCanvasRenderingContext2D,
      { width: 800, height: 160 } as OffscreenCanvas,
      state,
      1
    );

    expect(ctx.fills).toContainEqual(
      expect.objectContaining({
        fillStyle: 'rgba(0, 0, 0, 0.24)',
        height: 48,
        y: 32,
      })
    );
    expect(ctx.rects).toContainEqual(
      expect.objectContaining({
        height: 48,
        y: 32,
      })
    );
  });

  it('can render frame-number labels on the canvas ruler', () => {
    const ctx = new FakeCanvasContext();

    renderTimeline(
      ctx as unknown as OffscreenCanvasRenderingContext2D,
      { width: 200, height: 160 } as OffscreenCanvas,
      createState(),
      1,
      { ruler: { frameRate: 24, labelFormat: 'frame-number' } }
    );

    expect(ctx.texts).toContainEqual(expect.objectContaining({ text: '0' }));
    expect(ctx.texts).toContainEqual(expect.objectContaining({ text: '24' }));
    expect(ctx.texts).toContainEqual(expect.objectContaining({ text: '48' }));
  });

  it('does not draw sub-frame ruler ticks at the frame-aware zoom cap', () => {
    const ctx = new FakeCanvasContext();
    const engine = new TimelineEngine({
      duration: fromSeconds(1),
      tracks: [],
      zoomScale: 24 * 16,
    });
    engine.setViewportWidth(384);
    engine.setZoomScale(24 * 16);
    const state = engine.getState();

    renderTimeline(
      ctx as unknown as OffscreenCanvasRenderingContext2D,
      { width: 384, height: 160 } as OffscreenCanvas,
      state,
      1,
      {
        ruler: { frameRate: 24, labelFormat: 'frame-number' },
        showRulerLabels: false,
      }
    );

    const tickRects = ctx.rects.filter(
      (rect) =>
        rect.width === 1 &&
        ((rect.y === 16 && rect.height === 16) || (rect.y === 24 && rect.height === 8))
    );

    expect(tickRects).toHaveLength(25);
    expect(tickRects.every((rect) => rect.x % 16 === 0)).toBe(true);
  });
});
