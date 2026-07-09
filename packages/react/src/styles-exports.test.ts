import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';

const PACKAGE_CSS_FILES = [
  'packages/react/src/base.css',
  'packages/react/src/theme.css',
  'packages/react/src/styles.css',
  'packages/timeline/src/base.css',
  'packages/timeline/src/theme.css',
  'packages/timeline/src/styles.css',
] as const;

function readPackageJson(packagePath: string) {
  return JSON.parse(readFileSync(packagePath, 'utf8')) as {
    exports: Record<string, string | Record<string, string>>;
    scripts?: Record<string, string>;
  };
}

function readText(path: string) {
  return readFileSync(path, 'utf8');
}

function readRule(css: string, selector: string) {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) {
    return '';
  }

  const end = css.indexOf('\n}', start);
  if (end === -1) {
    return '';
  }

  return css.slice(start, end + '\n}'.length);
}

function readTimelineAliasRule(css: string) {
  const tokenIndex = css.indexOf('--timeline-panel: var(--background);');
  if (tokenIndex === -1) {
    return '';
  }

  const start = css.lastIndexOf(':where(', tokenIndex);
  const end = css.indexOf('\n}', tokenIndex);
  if (start === -1 || end === -1) {
    return '';
  }

  return css.slice(start, end + '\n}'.length);
}

function readControlUtilityRules(css: string) {
  const start = css.indexOf('.timeline-control-bar {');
  const end = css.indexOf('.timeline-dom-ruler {', start);
  if (start === -1 || end === -1) {
    return '';
  }

  return css.slice(start, end);
}

function getTimelineTokenNames(css: string) {
  return Array.from(
    new Set([...css.matchAll(/--timeline-[a-z0-9-]+:/g)].map((match) => match[0].slice(0, -1)))
  ).sort();
}

function getDocumentedTimelineTokenNames(markdown: string) {
  return Array.from(
    new Set([...markdown.matchAll(/`(--timeline-[a-z0-9-]+)`/g)].map((match) => match[1]))
  ).sort();
}

function getCssVariableReferences(css: string) {
  return Array.from(new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1])));
}

describe('CSS package exports', () => {
  it('exposes base, theme, and combined stylesheet entrypoints', () => {
    const reactPackage = readPackageJson('packages/react/package.json');
    const timelinePackage = readPackageJson('packages/timeline/package.json');

    for (const packageJson of [reactPackage, timelinePackage]) {
      expect(packageJson.exports['./base.css']).toBeTruthy();
      expect(packageJson.exports['./theme.css']).toBeTruthy();
      expect(packageJson.exports['./styles.css']).toBeTruthy();
    }
  });

  it('keeps root build output aligned with website preview', () => {
    const rootViteConfig = readText('vite.config.ts');

    expect(rootViteConfig).toContain('vp run build:www');
    expect(rootViteConfig).toContain('vp run --filter @techsquidtv/canvas-timeline-www preview');
  });

  it('keeps website and demo shell selectors out of package CSS', () => {
    for (const path of PACKAGE_CSS_FILES) {
      expect(readText(path), path).not.toMatch(/\.timeline-editor-/);
    }
  });

  it('keeps DOM timeline styling in package CSS instead of website CSS', () => {
    const reactBaseCss = readText('packages/react/src/base.css');
    const reactThemeCss = readText('packages/react/src/theme.css');
    const websiteCss = readText('apps/www/src/styles/global.css');

    expect(reactBaseCss).toContain('.timeline-dom-ruler');
    expect(reactThemeCss).toContain('.timeline-dom-clip');
    expect(reactThemeCss).toContain('.timeline-shell');
    expect(reactThemeCss).toContain('.timeline-control-bar');
    expect(websiteCss).not.toMatch(/\.timeline-dom-/);
    expect(websiteCss).not.toMatch(
      /^\s{2}\.timeline-(?:shell|stage|fill|track-list-overlay|scrollbar-row|control-bar)/m
    );
    expect(websiteCss).not.toContain('var(--timeline-canvas-background)');
  });

  it('keeps package CSS token-driven without raw visual colors or variable fallbacks', () => {
    for (const path of PACKAGE_CSS_FILES) {
      const css = readText(path);

      expect(css, path).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css, path).not.toMatch(/\b(?:rgb|rgba|hsl|hsla|oklch)\(/);
      expect(css, path).not.toMatch(/var\(\s*--[^),]+,/);
      expect(css, path).not.toMatch(/(^|[,{]\s*)\.dark\b/);
    }
  });

  it('keeps base CSS mechanically self-contained from timeline theme tokens', () => {
    const baseCss = readText('packages/react/src/base.css');
    const themeCss = readText('packages/react/src/theme.css');
    const baseGrabberLineRule = readRule(baseCss, '.timeline-time-grabber-line');
    const themeGrabberLineRule = readRule(themeCss, '.timeline-time-grabber-line');
    const aliasRule = readTimelineAliasRule(themeCss);

    expect(baseCss).not.toMatch(/var\(--timeline-/);
    expect(baseGrabberLineRule).toContain('width: 1px;');
    expect(themeGrabberLineRule).toContain('width: var(--timeline-playhead-width);');
    expect(aliasRule).toContain('--timeline-playhead-width: 1px;');
  });

  it('maps default timeline affordances to shadcn semantic tokens', () => {
    const themeCss = readText('packages/react/src/theme.css');
    const aliasRule = readTimelineAliasRule(themeCss);

    expect(aliasRule).toContain(':root,');
    expect(aliasRule).toContain('.timeline-root,');
    expect(aliasRule).toContain('.timeline-shell,');
    expect(aliasRule).toContain('.timeline-playhead-area,');
    expect(aliasRule).toContain('.timeline-time-grabber,');
    expect(aliasRule).toContain('.timeline-range-selector,');
    expect(aliasRule).toContain('.timeline-range-selector-overlay,');
    expect(aliasRule).toContain('.range-scrollbar,');
    expect(aliasRule).toContain('.timecode-input,');
    expect(aliasRule).toContain('.timecode-field,');
    expect(aliasRule).toContain('.timeline-clip-interaction-layer');
    expect(aliasRule).not.toContain('.timeline-control-bar');
    expect(aliasRule).not.toContain('.timeline-control-button');
    expect(aliasRule).not.toContain('.timeline-control-select');
    expect(aliasRule).not.toContain('.timeline-control-slider');
    expect(aliasRule).not.toContain('.timeline-viewport-scrollbar');
    expect(aliasRule).not.toContain('.timecode-field-input');
    expect(aliasRule).not.toContain('.timecode-field-trigger');
    expect(aliasRule).toContain('--timeline-panel: var(--background);');
    expect(aliasRule).toContain('--timeline-panel-muted: var(--muted);');
    expect(aliasRule).toContain('--timeline-panel-control: var(--input);');
    expect(aliasRule).toContain('--timeline-panel-control-hover: var(--accent);');
    expect(aliasRule).toContain('--timeline-border: var(--border);');
    expect(aliasRule).toContain('--timeline-border-width: 2px;');
    expect(aliasRule).toContain('--timeline-canvas-background: var(--timeline-panel);');
    expect(aliasRule).toContain('--timeline-ruler-background: var(--timeline-panel-muted);');
    expect(themeCss).toContain(
      '--timeline-track-divider: color-mix(in oklch, var(--timeline-border) 52%, transparent);'
    );
    expect(aliasRule).toContain('--timeline-track-divider-width: 1px;');
    expect(aliasRule).toContain('--timeline-marker: var(--timeline-ruler-text);');
    expect(aliasRule).toContain('--timeline-marker-text: var(--timeline-ruler-text);');
    expect(aliasRule).toContain('--timeline-clip-background: var(--timeline-panel-control-hover);');
    expect(aliasRule).toContain(
      '--timeline-clip-background-selected: color-mix(\n    in oklch,\n    var(--foreground) 18%,\n    var(--timeline-panel)\n  );'
    );
    expect(aliasRule).toContain('--timeline-clip-border: transparent;');
    expect(aliasRule).toContain('--timeline-clip-border-selected: transparent;');
    expect(aliasRule).toContain('--timeline-clip-text: var(--foreground);');
    expect(aliasRule).toContain('--timeline-clip-text-selected: var(--foreground);');
    expect(aliasRule).toContain('--timeline-playhead: var(--primary);');
    expect(aliasRule).toContain('--timeline-inout-accent: var(--ring);');
    expect(aliasRule).toContain('--timeline-scrollbar-bg: var(--timeline-panel);');
    expect(aliasRule).toContain(
      '--timeline-inout-area: color-mix(in oklch, var(--timeline-inout-accent) 18%, transparent);'
    );
    expect(aliasRule).toContain('--timeline-inout-border: var(--timeline-inout-accent);');
    expect(aliasRule).toContain('--timeline-control-foreground: var(--muted-foreground);');
    expect(aliasRule).toContain('--timeline-control-hover-border: var(--foreground);');
    expect(aliasRule).toContain('--timeline-control-hover-foreground: var(--accent-foreground);');
    expect(aliasRule).toContain('--timeline-control-active-background: var(--foreground);');
    expect(aliasRule).toContain('--timeline-control-active-foreground: var(--background);');
    expect(aliasRule).toContain('--timeline-control-slider-thumb: var(--foreground);');
    expect(aliasRule).toContain('--timeline-radius-md: calc(var(--radius) - 0.25rem);');
    expect(themeCss).not.toContain('\n.dark {\n  --timeline-panel: var(--background);');
    expect(themeCss).toContain(
      'border: var(--timeline-border-width) solid var(--timeline-border);'
    );
    expect(readRule(themeCss, '.timeline-scrollbar-row')).not.toContain(
      'border-top: var(--timeline-border-width) solid var(--timeline-border);'
    );
    expect(themeCss).toContain(
      'border-bottom: var(--timeline-track-divider-width) solid var(--timeline-track-divider);'
    );
  });

  it('keeps public control utility rules routed through timeline tokens', () => {
    const themeCss = readText('packages/react/src/theme.css');
    const controlRules = readControlUtilityRules(themeCss);

    expect(controlRules).toContain('color: var(--timeline-control-foreground);');
    expect(controlRules).toContain('border-color: var(--timeline-control-hover-border);');
    expect(controlRules).toContain('color: var(--timeline-control-hover-foreground);');
    expect(controlRules).toContain('background: var(--timeline-control-active-background);');
    expect(controlRules).toContain('color: var(--timeline-control-active-foreground);');
    expect(controlRules).toContain('background: var(--timeline-control-slider-thumb);');
    expect(controlRules).toContain('font-family: var(--timeline-input-font-family);');
    expect(controlRules).not.toMatch(
      /var\(--(?:foreground|background|muted-foreground|accent-foreground|font-mono)\)/
    );
  });

  it('keeps DOM-only range selector fill opt-in without painting the timeline overlay', () => {
    const baseCss = readText('packages/react/src/base.css');
    const themeCss = readText('packages/react/src/theme.css');

    expect(baseCss).toContain(
      '.timeline-range-selector-overlay .timeline-range-selector-indicator {\n  display: none;'
    );
    expect(themeCss).toContain(
      '.timeline-range-selector:not(.timeline-range-selector-overlay) .timeline-range-selector-indicator'
    );
    expect(themeCss).toContain('background: var(--timeline-inout-area);');
  });

  it('leaves clip interaction affordance shape to application theme overrides', () => {
    const themeCss = readText('packages/react/src/theme.css');

    expect(themeCss).not.toMatch(
      /\.timeline-clip-interaction-(?:handle|feedback)[^{]*\{[^}]*border-radius:/s
    );
  });

  it('keeps compact timeline timecode controls from inheriting standalone input height', () => {
    const themeCss = readText('packages/react/src/theme.css');

    expect(themeCss).toMatch(
      /\.timeline-timecode-control-button,[\s\S]*\.timeline-timecode-control-input \{[\s\S]*font-family: var\(--timeline-input-font-family\);[\s\S]*font-size: 0\.875rem;[\s\S]*font-weight: 600;[\s\S]*font-variant-numeric: tabular-nums;[\s\S]*line-height: 1\.25rem;/
    );
    expect(themeCss).toMatch(
      /\.timecode-field-trigger \{[\s\S]*font-family: var\(--timeline-input-font-family\);[\s\S]*font-size: 0\.875rem;[\s\S]*font-weight: 600;[\s\S]*font-variant-numeric: tabular-nums;/
    );
    expect(themeCss).toMatch(
      /\.timecode-label \{[\s\S]*font-family: var\(--timeline-input-font-family\);[\s\S]*font-size: 0\.875rem;[\s\S]*font-weight: 600;[\s\S]*font-variant-numeric: tabular-nums;/
    );
    expect(themeCss).toMatch(
      /\.timeline-timecode-control-input\.timecode-input \{[\s\S]*height: 1\.75rem;[\s\S]*font-family: var\(--timeline-input-font-family\);[\s\S]*font-variant-numeric: tabular-nums;[\s\S]*padding: 0 0\.5rem;[\s\S]*line-height: 1\.25rem;/
    );
    expect(themeCss).toMatch(
      /\.timeline-timecode-control-button\.timecode-field-trigger,[\s\S]*\.timeline-timecode-control-input\.timecode-input:focus-visible \{[\s\S]*outline: none;/
    );
    expect(readRule(themeCss, '.timecode-input:focus-visible')).toContain(
      'box-shadow: var(--timeline-input-focus-shadow);'
    );
    expect(readRule(themeCss, ".timecode-input[aria-invalid='true']:focus-visible")).toContain(
      'box-shadow: var(--timeline-input-invalid-shadow);'
    );
    expect(
      readRule(
        themeCss,
        ".timeline-timecode-control-input.timecode-input[aria-invalid='true']:focus-visible"
      )
    ).toContain('box-shadow: var(--timeline-input-invalid-shadow);');
  });

  it('keeps registry preview sizing in website CSS', () => {
    const websiteCss = readText('apps/www/src/styles/global.css');

    expect(websiteCss).toMatch(
      /\.registry-preview__stage \.registry-shadcn-theme,[\s\S]*\.component-preview__stage \.registry-shadcn-theme \{[\s\S]*width: 100%;[\s\S]*min-width: 0;[\s\S]*justify-items: center;/
    );

    for (const stage of [
      '.registry-preview__stage',
      '.registry-example__stage',
      '.component-preview__stage',
    ]) {
      expect(websiteCss).toContain(`${stage} .registry-live-root-frame,`);
      expect(websiteCss).toContain(`${stage} .registry-live-scrollbar-frame,`);
      expect(websiteCss).toContain(`${stage} .registry-live-timecode-frame,`);
    }
  });

  it('keeps React registry previews on neutral app-owned shadcn tokens', () => {
    const websiteCss = readText('apps/www/src/styles/global.css');
    const registryThemeRule = readRule(websiteCss, '.registry-shadcn-theme');
    const timecodeFieldFocusRule = readRule(
      websiteCss,
      '.registry-live-timecode-field-input:focus-visible'
    );

    expect(registryThemeRule).toContain('color-scheme: light;');
    expect(registryThemeRule).toContain('--background: oklch(1 0 0);');
    expect(registryThemeRule).toContain('--foreground: oklch(0.145 0 0);');
    expect(registryThemeRule).toContain('--primary: oklch(0.205 0 0);');
    expect(registryThemeRule).toContain('--ring: oklch(0.708 0 0);');
    expect(registryThemeRule).not.toMatch(/--timeline-[a-z0-9-]+:/);
    expect(registryThemeRule).not.toContain('0.6753 0.1208 82.7652');
    expect(registryThemeRule).not.toContain('0.62 0.16 250');
    expect(registryThemeRule).not.toContain('0.55 0.16 250');
    expect(timecodeFieldFocusRule).toContain('border-color: var(--ring);');
    expect(timecodeFieldFocusRule).toContain('box-shadow: 0 0 0 2px');
    expect(timecodeFieldFocusRule).toContain('var(--ring)');
    expect(timecodeFieldFocusRule).not.toContain('--timeline-input-focus');

    expect(readText('apps/www/src/components/ReactRegistryDemoPreview.tsx')).toContain(
      'className="registry-shadcn-theme"'
    );
    expect(readText('apps/www/src/components/ReactRegistryDemoPreview.tsx')).not.toContain(
      'className="docs-timeline-theme dark"'
    );
  });

  it('keeps docs demo theme scoped to showcase shadcn semantics plus explicit timeline overrides', () => {
    const websiteCss = readText('apps/www/src/styles/global.css');
    const docsTimelineThemeRule = readRule(websiteCss, '.docs-timeline-theme');
    const docsTimelineDarkThemeRule = readRule(websiteCss, '.docs-timeline-theme.dark');

    expect(docsTimelineThemeRule).toContain('color-scheme: dark;');
    expect(docsTimelineThemeRule).toContain('--background: oklch(0.17352 0 0);');
    expect(docsTimelineThemeRule).toContain('--foreground: oklch(0.8576 0 0);');
    expect(docsTimelineThemeRule).toContain('--muted: oklch(0.2024 0 0);');
    expect(docsTimelineThemeRule).toContain('--primary: oklch(0.6753 0.1208 82.7652);');
    expect(docsTimelineThemeRule).toContain('--ring: var(--primary);');
    expect(docsTimelineThemeRule).toContain('--radius: 0.25rem;');
    expect(docsTimelineDarkThemeRule).toContain('--ring: var(--primary);');
    expect(docsTimelineThemeRule).not.toMatch(/--timeline-[a-z0-9-]+:/);
    expect(docsTimelineDarkThemeRule).not.toMatch(/--timeline-[a-z0-9-]+:/);
    expect(websiteCss).toMatch(
      /\.docs-timeline-theme[\s\S]*:where\([\s\S]*\.timeline-root,[\s\S]*\.timecode-input,[\s\S]*\)[\s\S]*--timeline-inout-accent: oklch\(0\.62 0\.16 250\);/
    );

    expect(readText('apps/www/src/components/LiveDemoRenderer.tsx')).toContain(
      'className="docs-timeline-theme dark"'
    );
  });

  it('documents every default timeline theme token', () => {
    const themeCss = readText('packages/react/src/theme.css');
    const stylingDocs = readText('apps/www/src/content/docs/styling.mdx');

    expect(getDocumentedTimelineTokenNames(stylingDocs)).toEqual(
      getTimelineTokenNames(readTimelineAliasRule(themeCss))
    );
  });

  it('documents the app, timeline, and app-local token tiers', () => {
    const stylingDocs = readText('apps/www/src/content/docs/styling.mdx');

    expect(stylingDocs).toContain('Use app semantic tokens');
    expect(stylingDocs).toContain('Use `--timeline-*` tokens');
    expect(stylingDocs).toContain('Use app-local or demo-local tokens');
  });

  it('does not expose undocumented renderer timeline aliases', () => {
    const rendererTheme = readText('packages/renderer/src/theme.ts');

    expect(rendererTheme).not.toContain('--timeline-focus-ring');
    expect(rendererTheme).not.toContain('--timeline-font-mono');
    expect(rendererTheme).not.toContain('--timeline-font-sans');
  });

  it('keeps demo-only chrome off timeline theme tokens', () => {
    const demoCssFiles = [
      'apps/www/src/demos/shared-timeline-editor.css',
      'apps/www/src/demos/timeline-editor-controls/timeline-editor.css',
      'apps/www/src/demos/keyframe-opacity/timeline-editor.css',
    ] as const;
    const forbiddenDemoTokens = [
      '--timeline-panel',
      '--timeline-border',
      '--timeline-border-width',
      '--timeline-keyframe-fill-selected',
      '--timeline-radius-full',
      '--timeline-radius-sm',
      '--timeline-scrollbar-bg',
      '--timeline-track-header-background',
      '--timeline-track-header-resize-handle-hover',
      '--timeline-editor-demo-height',
      '--timeline-editor-scrollbar-gutter-size',
      '--timeline-editor-scrollbar-track-size',
      '--timeline-editor-scrollbar-gutter-padding',
      '--timeline-editor-scrollbar-gutter-padding-inline',
      '--timeline-editor-scrollbar-surface',
    ];

    for (const path of demoCssFiles) {
      const css = readText(path);
      const references = getCssVariableReferences(css);

      for (const token of forbiddenDemoTokens) {
        expect(css, path).not.toContain(`${token}:`);
        expect(references, path).not.toContain(token);
      }
    }
  });

  it('keeps docs registry preview chrome on app semantic tokens', () => {
    const globalCss = readText('apps/www/src/styles/global.css');

    expect(globalCss).not.toContain('background: var(--timeline-scrollbar-bg);');
    expect(globalCss).not.toContain('border-color: var(--timeline-input-focus-border);');
    expect(globalCss).not.toContain('box-shadow: var(--timeline-input-focus-shadow);');
  });

  it('defines complete default timeline tokens in package theme CSS', () => {
    const themeCss = readText('packages/react/src/theme.css');
    const aliasRule = readTimelineAliasRule(themeCss);

    for (const token of [
      '--timeline-input-foreground: var(--foreground);',
      '--timeline-input-placeholder: var(--muted-foreground);',
      '--timeline-input-focus-border: var(--timeline-clip-focus-ring);',
      '--timeline-input-focus-ring: color-mix(\n    in oklch,\n    var(--timeline-clip-focus-ring) 36%,\n    transparent\n  );',
      '--timeline-input-invalid-border: var(--destructive);',
      '--timeline-input-invalid-ring: color-mix(in oklch, var(--destructive) 28%, transparent);',
      '--timeline-control-foreground: var(--muted-foreground);',
      '--timeline-control-hover-border: var(--foreground);',
      '--timeline-control-hover-foreground: var(--accent-foreground);',
      '--timeline-control-active-background: var(--foreground);',
      '--timeline-control-active-foreground: var(--background);',
      '--timeline-control-slider-thumb: var(--foreground);',
      '--timeline-border-width: 2px;',
      '--timeline-track-divider: color-mix(in oklch, var(--timeline-border) 52%, transparent);',
      '--timeline-track-divider-width: 1px;',
      '--timeline-clip-background: var(--timeline-panel-control-hover);',
      '--timeline-clip-text: var(--foreground);',
      '--timeline-marker-text: var(--timeline-ruler-text);',
      '--timeline-radius-sm: calc(var(--radius) - 0.125rem);',
      '--timeline-radius-md: calc(var(--radius) - 0.25rem);',
      '--timeline-scrollbar-bg: var(--timeline-panel);',
      '--timeline-scrollbar-thumb: var(--muted-foreground);',
      '--timeline-scrollbar-thumb-hover: var(--foreground);',
      '--timeline-scrollbar-handle-grip: color-mix(in oklch, var(--background) 72%, transparent);',
      '--timeline-clip-focus-ring: var(--primary);',
      '--timeline-inout-accent: var(--ring);',
      '--timeline-snap-line: var(--ring);',
    ]) {
      expect(aliasRule).toContain(token);
    }

    for (const token of [
      '--timeline-canvas-background: var(--timeline-panel);',
      '--timeline-ruler-background: var(--timeline-panel-muted);',
      '--timeline-border-width: 2px;',
      '--timeline-track-divider: color-mix(in oklch, var(--timeline-border) 52%, transparent);',
      '--timeline-track-divider-width: 1px;',
      '--timeline-marker: var(--timeline-ruler-text);',
      '--timeline-marker-text: var(--timeline-ruler-text);',
      '--timeline-clip-background: var(--timeline-panel-control-hover);',
      '--timeline-clip-background-selected: color-mix(',
      '--timeline-clip-border: transparent;',
      '--timeline-clip-border-selected: transparent;',
      '--timeline-playhead: var(--primary);',
      '--timeline-input-background: var(--timeline-panel-control);',
      '--timeline-radius-sm: calc(var(--radius) - 0.125rem);',
      '--timeline-radius-md: calc(var(--radius) - 0.25rem);',
    ]) {
      expect(aliasRule).toContain(token);
    }
  });
});
