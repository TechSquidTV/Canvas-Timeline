---
name: canvas-timeline-styling-contract
description: Use when styling Canvas Timeline, adding React components, hooks, renderer features, package CSS, demos, or docs that affect the DOM/canvas split, shadcn-like theming contract, performance-sensitive rendering, or headless composition paths.
---

# Canvas Timeline Styling Contract

## Core Model

Canvas Timeline prioritizes editor performance. Before styling or adding a
component, decide whether the work belongs in the low-density DOM layer or the
high-density canvas renderer.

Default decision order:

1. **Headless behavior first**: model reusable interaction, state, and commands
   in core APIs or React hooks.
2. **React hook second**: expose enough headless state/props for custom DOM,
   package DOM primitives, and renderer-backed compositions.
3. **DOM and canvas implementations third**: package components and canvas
   renderer consume the same headless behavior where possible.

All user-facing features must be available to DOM implementations. Canvas may be
the fast default for dense rendering, but it must not be the only way to access
timeline behavior.

## Source Links

Open the relevant source before changing behavior:

- [Styling docs](file:///Users/techsquidtv/Documents/Git/canvas-timeline/apps/www/src/content/docs/styling.mdx) for the public styling contract.
- [Canvas renderer customization docs](file:///Users/techsquidtv/Documents/Git/canvas-timeline/apps/www/src/content/docs/renderer-customization.mdx) for renderer styling overrides and custom dense layers.
- [System architecture docs](file:///Users/techsquidtv/Documents/Git/canvas-timeline/apps/www/src/content/docs/architecture.mdx) for the DOM/canvas architecture split.
- [React base CSS](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/react/src/base.css) for mechanics, geometry, hit targets, and affordance shapes.
- [React theme CSS](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/react/src/theme.css) for shadcn-token visual treatment and `--timeline-*` aliases.
- [Renderer theme resolver](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/renderer/src/theme.ts) and [CanvasRenderer](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/renderer/src/CanvasRenderer.tsx) for CSS-variable-to-worker behavior.
- [CSS export tests](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/react/src/styles-exports.test.ts) for guardrails around package CSS and docs drift.
- [React DOM timeline demo](file:///Users/techsquidtv/Documents/Git/canvas-timeline/apps/www/src/demos/react-dom-timeline/ReactDOMTimeline.tsx) for DOM implementation parity.

## DOM vs Canvas Boundary

Prefer canvas-backed rendering for dense, repeated, or frame-sensitive visuals
in the default high-performance editor path:

- Clip bodies, labels, selected clip fills/borders, and future thumbnails when
  they would otherwise produce many DOM nodes.
- Track lanes, row dividers, ruler ticks/labels, markers, snap lines, in/out
  range fill, waveforms, keyframes, and other high-count visuals.
- Drawing that would create many DOM nodes or update on scroll, zoom, scrub, or
  playback.

Do not treat this as "canvas only." The DOM implementation must still expose the
same feature behavior and render equivalent states, even if it uses simpler DOM
visuals or is intended for lower-density compositions and demos.

Use DOM/CSS for low-count interaction chrome:

- Root/stage geometry, scrollbars, playhead grabbers, in/out grabbers,
  delegated active clip affordances, focus rings, timecode fields, and optional
  shell/control utility classes.
- Hit targets and pointer-capture surfaces.
- Accessibility, keyboard focus, form controls, and custom application chrome.

If a feature needs both, put behavior in a hook, provide a complete DOM path,
and let canvas draw dense visuals for the high-performance path.

## CSS Layer Contract

Package CSS has two explicit layers:

- `base.css`: mechanics only. Geometry, stacking, sizing, pointer behavior, hit
  areas, accessibility helpers, and intrinsic affordance shapes. It must be
  mechanically usable without `theme.css`.
- `theme.css`: shadcn-token visual treatment. Colors, borders, shadows,
  typography, focus treatment, theme radii, transitions, and `--timeline-*`
  aliases that bridge app semantic tokens into DOM chrome and renderer theme
  resolution.

`styles.css` is only the combined import of `base.css` and `theme.css`.

Do not put product/page chrome in package CSS. Inspectors, media previews,
dialogs, page sections, demo framing, and app-specific panels belong in
application CSS.

## API Boundary Check

Do not add package React components for generic layout composition unless they
carry timeline-specific behavior, state, accessibility, or interaction
semantics. Keep components app/demo-owned when they are primarily:

- `div` wrappers with package class names.
- shadcn-style composition.
- Wrappers around third-party layout primitives.
- Specific editor shell arrangements.

Package CSS may include structural rules for exported timeline primitives, but
demo/page layout should remain in application CSS unless the rule is required
for an exported timeline primitive to function correctly.

## Theme Rules

Follow shadcn ownership:

- Apps own semantic tokens such as `--background`, `--foreground`, `--border`,
  `--input`, `--ring`, `--primary`, `--muted`, `--accent`, `--destructive`,
  `--radius`, `--font-sans`, and `--font-mono`.
- Package `theme.css` consumes those tokens and maps them to `--timeline-*`.
- Avoid raw visual colors, `.dark` scopes, and CSS variable fallbacks in package
  CSS.
- Scope local timeline-specific treatment with `--timeline-*` overrides on a
  package root or primitive container.

Renderer theme resolution must read CSS variables on the main thread only when
the theme changes, then send serializable options to the worker. Never read CSS
variables during scroll, scrub, zoom, playback, or draw frames.

## Feature Workflow

When adding or changing a feature:

1. Identify the reusable headless behavior and prefer core APIs or React hooks.
2. Make the DOM path complete first or at the same time as renderer support.
3. Add package DOM primitives only for low-count chrome or accessibility
   surfaces.
4. Add canvas drawing only for dense visuals or performance-critical rendering,
   never as the only implementation of user-facing behavior.
5. Put structural CSS in `packages/react/src/base.css`; put token-driven visual
   treatment in `packages/react/src/theme.css`.
6. Keep demo CSS thematic/compositional only. If a demo needs CSS to fix
   package geometry or hit testing, move that rule into package CSS.

## Validation

For styling contract changes, run the focused package CSS tests:

```bash
vp test packages/react/src/styles-exports.test.ts
```

For component, hook, or renderer changes, add focused tests around both the
headless behavior and at least one DOM composition. Include renderer tests when
canvas output or renderer theme resolution changes.

Finish with:

```bash
vp check
```
