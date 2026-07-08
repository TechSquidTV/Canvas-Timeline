import { describe, it, expect } from 'vite-plus/test';
import {
  COLOR_PRESETS,
  createTimelineRendererTheme,
  defaultTimelineRendererTheme,
  getPresetColor,
  resolveTimelineRendererThemeFromElement,
} from '#renderer/theme';

function getHexChannelSpread(color: string) {
  if (color === 'transparent') {
    return 0;
  }

  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) {
    return Number.POSITIVE_INFINITY;
  }

  const channels = [0, 2, 4].map((start) => Number.parseInt(match[1].slice(start, start + 2), 16));
  return Math.max(...channels) - Math.min(...channels);
}

describe('Timeline Canvas Theme', () => {
  it('should have predefined color presets', () => {
    expect(COLOR_PRESETS).toBeInstanceOf(Array);
    expect(COLOR_PRESETS.length).toBeGreaterThan(0);
    expect(COLOR_PRESETS[0]).toHaveProperty('value');
    expect(COLOR_PRESETS[0]).toHaveProperty('name');
  });

  it('should return a valid random preset color', () => {
    const randomColor = getPresetColor(5);
    const presetValues = COLOR_PRESETS.map((p) => p.value);
    expect(presetValues).toContain(randomColor);
  });

  it('keeps built-in clip default colors neutral', () => {
    const { focusRing: _focusRing, ...clipColors } = defaultTimelineRendererTheme.colors.clip;

    for (const color of Object.values(clipColors)) {
      expect(getHexChannelSpread(color)).toBeLessThanOrEqual(8);
    }
  });

  it('keeps the built-in canvas in/out range fill default aligned with the CSS token', () => {
    expect(defaultTimelineRendererTheme.colors.feedback.inOutArea).toBe('rgba(59, 130, 246, 0.18)');
    expect(defaultTimelineRendererTheme.colors.feedback.inOutBorder).toBe('#3b82f6');
    expect(defaultTimelineRendererTheme.colors.feedback.dropTarget).toBe(
      'rgba(59, 130, 246, 0.12)'
    );
    expect(defaultTimelineRendererTheme.colors.feedback.dropTargetInvalid).toBe(
      'rgba(239, 68, 68, 0.14)'
    );
  });

  it('merges partial renderer theme overrides with defaults', () => {
    const customTheme = createTimelineRendererTheme({
      colors: {
        clip: {
          bg: '#111111',
        },
      },
    });

    expect(customTheme.colors.clip.bg).toBe('#111111');
    expect(customTheme.colors.clip.borderSelected).toBe(
      defaultTimelineRendererTheme.colors.clip.borderSelected
    );
    expect(customTheme.colors.clip.textSelected).toBe(
      defaultTimelineRendererTheme.colors.clip.textSelected
    );
    expect(customTheme.colors.marker.fill).toBe(defaultTimelineRendererTheme.colors.marker.fill);
    expect(customTheme.colors.marker.text).toBe(defaultTimelineRendererTheme.colors.marker.text);
    expect(customTheme.colors.border).toBe(defaultTimelineRendererTheme.colors.border);
    expect(customTheme.metrics.borderWidth).toBe(defaultTimelineRendererTheme.metrics.borderWidth);
    expect(customTheme.metrics.rulerHeight).toBe(defaultTimelineRendererTheme.metrics.rulerHeight);
  });

  it('resolves timeline CSS variables before applying explicit overrides', () => {
    const element = document.createElement('div');
    element.style.setProperty('--timeline-canvas-background', '#010203');
    element.style.setProperty('--timeline-clip-background', '#040506');
    element.style.setProperty('--timeline-marker', '#050607');
    element.style.setProperty('--timeline-marker-text', '#060708');
    document.body.appendChild(element);

    const resolvedTheme = resolveTimelineRendererThemeFromElement(element, {
      colors: {
        clip: {
          bg: '#101112',
        },
      },
    });

    expect(resolvedTheme.colors.background).toBe('rgb(1, 2, 3)');
    expect(resolvedTheme.colors.clip.bg).toBe('#101112');
    expect(resolvedTheme.colors.marker.fill).toBe('rgb(5, 6, 7)');
    expect(resolvedTheme.colors.marker.text).toBe('rgb(6, 7, 8)');

    element.remove();
  });

  it('resolves documented shadcn clip fallback tokens', () => {
    const element = document.createElement('div');
    element.style.setProperty('--accent', '#112233');
    element.style.setProperty('--foreground', '#445566');
    document.body.appendChild(element);

    const resolvedTheme = resolveTimelineRendererThemeFromElement(element);

    expect(resolvedTheme.colors.clip.bgSelected).toBe('rgb(17, 34, 51)');
    expect(resolvedTheme.colors.clip.textSelected).toBe('rgb(68, 85, 102)');

    element.remove();
  });

  it('resolves shadcn tokens for default timeline affordances', () => {
    const element = document.createElement('div');
    element.style.setProperty('--background', '#010203');
    element.style.setProperty('--foreground', '#112233');
    element.style.setProperty('--primary', '#778899');
    element.style.setProperty('--ring', '#778899');
    element.style.setProperty('--timeline-inout-area', '#223344');
    element.style.setProperty('--muted-foreground', '#445566');
    document.body.appendChild(element);

    const resolvedTheme = resolveTimelineRendererThemeFromElement(element);

    expect(resolvedTheme.colors.background).toBe('rgb(1, 2, 3)');
    expect(resolvedTheme.colors.clip.borderSelected).toBe('transparent');
    expect(resolvedTheme.colors.marker.fill).toBe('rgb(68, 85, 102)');
    expect(resolvedTheme.colors.marker.text).toBe('rgb(68, 85, 102)');
    expect(resolvedTheme.colors.feedback.inOutArea).toBe('rgb(34, 51, 68)');
    expect(resolvedTheme.colors.feedback.inOutBorder).toBe('rgb(119, 136, 153)');

    element.remove();
  });

  it('resolves In/Out range colors from the timeline accent token', () => {
    const element = document.createElement('div');
    element.style.setProperty('--timeline-inout-accent', '#123456');
    document.body.appendChild(element);

    const resolvedTheme = resolveTimelineRendererThemeFromElement(element);

    expect(resolvedTheme.colors.feedback.inOutArea).toBe('rgb(18, 52, 86)');
    expect(resolvedTheme.colors.feedback.inOutBorder).toBe('rgb(18, 52, 86)');

    element.remove();
  });

  it('resolves clip drop feedback colors from timeline tokens', () => {
    const element = document.createElement('div');
    element.style.setProperty('--timeline-drop-target', '#112233');
    element.style.setProperty('--timeline-drop-target-invalid', '#445566');
    element.style.setProperty('--timeline-drop-target-border', '#778899');
    document.body.appendChild(element);

    const resolvedTheme = resolveTimelineRendererThemeFromElement(element);

    expect(resolvedTheme.colors.feedback.dropTarget).toBe('rgb(17, 34, 51)');
    expect(resolvedTheme.colors.feedback.dropTargetInvalid).toBe('rgb(68, 85, 102)');
    expect(resolvedTheme.colors.feedback.dropTargetBorder).toBe('rgb(119, 136, 153)');

    element.remove();
  });

  it('resolves structural border and track divider tokens separately', () => {
    const element = document.createElement('div');
    element.style.setProperty('--card', '#010203');
    element.style.setProperty('--muted', '#040506');
    element.style.setProperty('--border', '#070809');
    element.style.setProperty('--timeline-panel', '#111213');
    element.style.setProperty('--timeline-panel-muted', '#141516');
    element.style.setProperty('--timeline-border', '#171819');
    element.style.setProperty('--timeline-track-divider', '#1a1b1c');
    element.style.setProperty('--timeline-track-locked-overlay', '#1d1e1f');
    element.style.setProperty('--timeline-border-width', '2px');
    element.style.setProperty('--timeline-track-divider-width', '0.5px');
    document.body.appendChild(element);

    const resolvedTheme = resolveTimelineRendererThemeFromElement(element);

    expect(resolvedTheme.colors.background).toBe('rgb(17, 18, 19)');
    expect(resolvedTheme.colors.ruler.bg).toBe('rgb(20, 21, 22)');
    expect(resolvedTheme.colors.border).toBe('rgb(23, 24, 25)');
    expect(resolvedTheme.colors.track.divider).toBe('rgb(26, 27, 28)');
    expect(resolvedTheme.colors.track.lockedOverlay).toBe('rgb(29, 30, 31)');
    expect(resolvedTheme.metrics.borderWidth).toBe(2);
    expect(resolvedTheme.metrics.trackDividerWidth).toBe(0.5);
    expect(resolvedTheme.colors.clip.border).toBe('transparent');

    element.remove();
  });

  it('resolves canvas clip geometry metric tokens', () => {
    const element = document.createElement('div');
    element.style.setProperty('--timeline-clip-radius', '6px');
    element.style.setProperty('--timeline-clip-inset-y', '4px');
    element.style.setProperty('--timeline-clip-label-padding-x', '12px');
    document.body.appendChild(element);

    const resolvedTheme = resolveTimelineRendererThemeFromElement(element);

    expect(resolvedTheme.metrics.clipRadius).toBe(6);
    expect(resolvedTheme.metrics.clipInsetY).toBe(4);
    expect(resolvedTheme.metrics.clipLabelPaddingX).toBe(12);

    element.remove();
  });

  it('lets timeline clip border tokens opt into clip outlines', () => {
    const element = document.createElement('div');
    element.style.setProperty('--timeline-clip-border', '#112233');
    element.style.setProperty('--timeline-clip-border-selected', '#445566');
    document.body.appendChild(element);

    const resolvedTheme = resolveTimelineRendererThemeFromElement(element);

    expect(resolvedTheme.colors.clip.border).toBe('rgb(17, 34, 51)');
    expect(resolvedTheme.colors.clip.borderSelected).toBe('rgb(68, 85, 102)');

    element.remove();
  });

  it('lets timeline selected clip text override semantic selected text', () => {
    const element = document.createElement('div');
    element.style.setProperty('--secondary-foreground', '#112233');
    element.style.setProperty('--timeline-clip-text-selected', '#445566');
    document.body.appendChild(element);

    const resolvedTheme = resolveTimelineRendererThemeFromElement(element);

    expect(resolvedTheme.colors.clip.textSelected).toBe('rgb(68, 85, 102)');

    element.remove();
  });

  it('lets explicit selected clip text override CSS tokens', () => {
    const element = document.createElement('div');
    element.style.setProperty('--timeline-clip-text-selected', '#112233');
    document.body.appendChild(element);

    const resolvedTheme = resolveTimelineRendererThemeFromElement(element, {
      colors: {
        clip: {
          textSelected: '#778899',
        },
      },
    });

    expect(resolvedTheme.colors.clip.textSelected).toBe('#778899');

    element.remove();
  });

  it('lets timeline marker token override semantic marker color', () => {
    const element = document.createElement('div');
    element.style.setProperty('--muted-foreground', '#112233');
    element.style.setProperty('--timeline-marker', '#445566');
    document.body.appendChild(element);

    const resolvedTheme = resolveTimelineRendererThemeFromElement(element);

    expect(resolvedTheme.colors.marker.fill).toBe('rgb(68, 85, 102)');

    element.remove();
  });

  it('resolves marker label text from the timeline marker text token', () => {
    const element = document.createElement('div');
    element.style.setProperty('--muted-foreground', '#112233');
    element.style.setProperty('--timeline-ruler-text', '#445566');
    element.style.setProperty('--timeline-marker-text', '#778899');
    document.body.appendChild(element);

    const resolvedTheme = resolveTimelineRendererThemeFromElement(element);

    expect(resolvedTheme.colors.marker.text).toBe('rgb(119, 136, 153)');

    element.remove();
  });

  it('resolves marker label text from ruler text when marker text is omitted', () => {
    const element = document.createElement('div');
    element.style.setProperty('--muted-foreground', '#112233');
    element.style.setProperty('--timeline-ruler-text', '#445566');
    document.body.appendChild(element);

    const resolvedTheme = resolveTimelineRendererThemeFromElement(element);

    expect(resolvedTheme.colors.marker.text).toBe('rgb(68, 85, 102)');

    element.remove();
  });

  it('lets explicit marker theme override CSS tokens', () => {
    const element = document.createElement('div');
    element.style.setProperty('--timeline-marker', '#112233');
    element.style.setProperty('--timeline-marker-text', '#445566');
    document.body.appendChild(element);

    const resolvedTheme = resolveTimelineRendererThemeFromElement(element, {
      colors: {
        marker: {
          fill: '#778899',
          text: '#99aabb',
        },
      },
    });

    expect(resolvedTheme.colors.marker.fill).toBe('#778899');
    expect(resolvedTheme.colors.marker.text).toBe('#99aabb');

    element.remove();
  });

  it('resolves ruler font and clip font from CSS variables', () => {
    const element = document.createElement('div');
    element.style.setProperty('--font-mono', 'Courier New');
    element.style.setProperty('--font-sans', 'Helvetica');
    element.style.setProperty('--timeline-font-ruler', '14px Courier New');
    element.style.setProperty('--timeline-font-clip', '16px Helvetica');
    document.body.appendChild(element);

    const resolvedTheme = resolveTimelineRendererThemeFromElement(element);

    expect(resolvedTheme.fonts.ruler).toBe('14px Courier New');
    expect(resolvedTheme.fonts.clip).toBe('16px Helvetica');

    element.remove();
  });

  it('falls back to font-mono and font-sans when specific font overrides are omitted', () => {
    const element = document.createElement('div');
    element.style.setProperty('--font-mono', 'Courier New');
    element.style.setProperty('--font-sans', 'Helvetica');
    document.body.appendChild(element);

    const resolvedTheme = resolveTimelineRendererThemeFromElement(element);

    expect(resolvedTheme.fonts.ruler).toBe('10px Courier New');
    expect(resolvedTheme.fonts.clip).toBe('12px Helvetica');

    element.remove();
  });

  it('ignores undocumented timeline font aliases', () => {
    const element = document.createElement('div');
    element.style.setProperty('--timeline-font-mono', 'Ignored Mono');
    element.style.setProperty('--timeline-font-sans', 'Ignored Sans');
    element.style.setProperty('--font-mono', 'Courier New');
    element.style.setProperty('--font-sans', 'Helvetica');
    document.body.appendChild(element);

    const resolvedTheme = resolveTimelineRendererThemeFromElement(element);

    expect(resolvedTheme.fonts.ruler).toBe('10px Courier New');
    expect(resolvedTheme.fonts.clip).toBe('12px Helvetica');

    element.remove();
  });

  it('resolves clip focusRing from CSS variables and overrides', () => {
    const element = document.createElement('div');
    element.style.setProperty('--timeline-clip-focus-ring', '#112233');
    document.body.appendChild(element);

    const resolvedTheme = resolveTimelineRendererThemeFromElement(element);
    expect(resolvedTheme.colors.clip.focusRing).toBe('rgb(17, 34, 51)');

    const overriddenTheme = resolveTimelineRendererThemeFromElement(element, {
      colors: {
        clip: {
          focusRing: '#445566',
        },
      },
    });
    expect(overriddenTheme.colors.clip.focusRing).toBe('#445566');

    element.remove();
  });

  it('ignores undocumented timeline focus ring alias', () => {
    const element = document.createElement('div');
    element.style.setProperty('--timeline-focus-ring', '#112233');
    element.style.setProperty('--primary', '#445566');
    document.body.appendChild(element);

    const resolvedTheme = resolveTimelineRendererThemeFromElement(element);

    expect(resolvedTheme.colors.clip.focusRing).toBe('rgb(68, 85, 102)');

    element.remove();
  });
});
