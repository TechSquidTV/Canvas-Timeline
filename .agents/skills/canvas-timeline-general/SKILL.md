---
name: canvas-timeline-general
description: Orient before engineering, refactoring, or testing in the Canvas Timeline monorepo.
---

# Canvas Timeline General

## Quick Start Procedure

- [ ] **Check Scope**: Use [manage-live-demos](file:///Users/techsquidtv/Documents/Git/canvas-timeline/.agents/skills/manage-live-demos/SKILL.md) instead if editing `apps/www/src/demos` or demo registries.
- [ ] **Locate Package**: Ensure changes reside in the lowest appropriate boundary (see map below).
- [ ] **Docs**: Read [architecture.mdx](file:///Users/techsquidtv/Documents/Git/canvas-timeline/apps/www/src/content/docs/architecture.mdx) for architecture and [styling.mdx](file:///Users/techsquidtv/Documents/Git/canvas-timeline/apps/www/src/content/docs/styling.mdx) for styling.

---

## Performance-Driven Architecture Split

To maintain a responsive 60fps editor, rendering and interaction are split strictly by density:

### Canvas Layer (High-Density / 2D Context)

- **Responsibility**: Draws repeated, high-frequency, or complex visuals (clips, track lanes, ruler ticks, markers, snap lines, waveforms).
- **Rationale**: Keeps the DOM tree flat. Rendering hundreds of clips as DOM nodes triggers layout thrashing (reflow/repaint storms) on zoom, scroll, or playhead scrub.
- **Rule**: Keep drawing routines in the worker context completely DOM-free.

### React & CSS Layer (Low-Density / DOM chrome)

- **Responsibility**: Manages viewport structure, scrollbars, playhead grabbers, in/out grabbers, active focus rings, and the [ClipInteractionLayer.tsx](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/react/src/components/interactions/ClipInteractionLayer.tsx).
- **Clip Hit-Testing**: Rather than mounting a React/DOM subtree for every clip, [ClipInteractionLayer.tsx](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/react/src/components/interactions/ClipInteractionLayer.tsx) uses engine hit testing to overlay **a single, delegated active affordance** for the clip currently hovered or edited.
- **Pointer Capture**: Use pointer capture on pointer-down events for drag/trim interactions to bypass window-level fallback listeners.

### Decoupled Application Metadata

- Keep `TimelineState` lean (IDs, times, selection, locking, and lightweight metadata).
- Store heavy domain data (waveforms, transcripts, blobs, URLs) in external app stores keyed by stable `sourceId` or `clip.id`.
- **Rationale**: Keeps the undo/redo/history stack footprint minimal, allowing state snapshots and serialization to take <1ms.

---

## Gotchas & Invariants

- **RationalTime**: All times must be `RationalTime` objects, **not decimal seconds**. Convert only at outer UI edges via [packages/utils](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/utils).
- **Stable IDs**: Track and clip IDs must be stable strings. **Do not use array indices** (causes edits, history, and undo glitches).
- **Sort Order**: Clips must stay sorted by `timelineStart`.
- **No Per-Frame React State**: Do not map high-frequency ticks (render/playhead events) to React state. Use refs or direct DOM manipulations.
- **DOM-Free Worker**: Renderer/worker modules must be completely DOM-free. Read CSS variables on the main thread inside `CanvasRenderer` theme resolution and post serializable options to the worker.
- **Theme Resolution Performance**: Resolve CSS variables only when the theme changes (using a stable `themeKey` like `'light'`, `'dark'`), **never** during scrolling, scrubbing, zooming, playback, or drawing frames.
- **CSS Geometry**: Structural geometry or hit-testing CSS rules must go in [base.css](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/react/src/base.css), never in demo or docs CSS.

---

## Project Map & Boundaries

### Publishable Packages

- [packages/utils](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/utils): rational time, timecode, and shared math utilities. Keep it dependency-light and framework-free.
- [packages/core](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/core): framework-free timeline model, state (`TimelineState`, `Track`, `Clip`, `Marker`), playback, history, clipboard, snapping, hit testing, and edit commands.
- [packages/react](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/react): React provider/context, hooks, DOM interaction components, scrollbars, timecode controls, range scrollbar, base styles, and docs metadata exports.
- [packages/renderer](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/renderer): canvas renderer, worker-backed drawing loop, renderer theme resolution, and draw modules.
- [packages/html-media-adapter](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/html-media-adapter): HTMLMediaElement sync adapter and React helper hooks for media playback.
- [packages/mediabunny-adapter](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/mediabunny-adapter): Mediabunny frame/media adapter plus optional React helpers under the `./react` export.
- [packages/timeline](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/timeline): batteries-included aggregate package. Prefer re-exports and package-level style copies here instead of new behavior.

### Applications & Documentation

- [apps/www](file:///Users/techsquidtv/Documents/Git/canvas-timeline/apps/www): Astro docs site, source-backed demos, blog/docs content, API reference generation, React registry snippets, Open Graph images, and the primary QA playground.
- [apps/www/src/demos](file:///Users/techsquidtv/Documents/Git/canvas-timeline/apps/www/src/demos): executable demo sources. Use [manage-live-demos](file:///Users/techsquidtv/Documents/Git/canvas-timeline/.agents/skills/manage-live-demos/SKILL.md) for demo or registry work.
- [.github](file:///Users/techsquidtv/Documents/Git/canvas-timeline/.github): contributor docs, Dependabot, and GitHub Actions workflows.
- [.agents/skills](file:///Users/techsquidtv/Documents/Git/canvas-timeline/.agents/skills): repo-local Codex skills. Keep maps and validation commands synchronized with source moves.

### Repository Tooling

- [vite.config.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/vite.config.ts): Vite+ workspace config, aliases, staged formatting, repo tasks, and Oxlint rules.
- [scripts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/scripts): repository validators and docs/package verification scripts.
- [tools](file:///Users/techsquidtv/Documents/Git/canvas-timeline/tools): local tooling extensions, including custom Oxlint rules.
- Generated outputs such as `dist`, `.astro`, `.generated`, `.wrangler`, `coverage`, and `node_modules` are build artifacts, not source boundaries.

Before moving docs demo code into `packages/react`, distinguish reusable timeline
primitives from app composition. Prefer package hooks/components only when they
expose timeline behavior or accessibility, not merely layout convenience. Adapter
packages should own media integration details rather than pushing those concerns
into `packages/core` or `packages/renderer`.

---

## Source Hotspots

- **Core**: [index.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/core/src/index.ts) | [types.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/core/src/types.ts) | [engine.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/core/src/engine.ts) | [playback.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/core/src/playback.ts) | [history.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/core/src/history.ts)
- **React Components**: [components](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/react/src/components) is split into `controls`, `interactions`, `playhead`, `scrollbars`, `surface`, and `tracks`.
- **React Hooks**: [hooks](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/react/src/hooks) is split into `clips`, `core`, `editing`, `keyframes`, `markers`, `playback`, `selection`, `tracks`, and `viewport`; public exports flow through [hooks/index.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/react/src/hooks/index.ts).
- **React Exports & Styles**: [index.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/react/src/index.ts) | [components/index.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/react/src/components/index.ts) | [base.css](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/react/src/base.css) | [theme.css](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/react/src/theme.css) | [docs-metadata.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/react/src/docs-metadata.ts)
- **Renderer**: [index.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/renderer/src/index.ts) | [CanvasRenderer.tsx](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/renderer/src/CanvasRenderer.tsx) | [renderTimeline.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/renderer/src/renderTimeline.ts) | [theme.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/renderer/src/theme.ts) | [worker.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/renderer/src/worker.ts)
- **Drawers**: [clips.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/renderer/src/render/clips.ts) | [tracks.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/renderer/src/render/tracks.ts) | [ruler.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/renderer/src/render/ruler.ts)
- **Adapters**: [html-media-adapter/src/index.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/html-media-adapter/src/index.ts) | [mediabunny-adapter/src/index.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/mediabunny-adapter/src/index.ts) | [mediabunny-adapter/src/react.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/mediabunny-adapter/src/react.ts)
- **Docs Site**: [content/docs](file:///Users/techsquidtv/Documents/Git/canvas-timeline/apps/www/src/content/docs) | [demos](file:///Users/techsquidtv/Documents/Git/canvas-timeline/apps/www/src/demos) | [data/react-registry.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/apps/www/src/data/react-registry.ts) | [scripts/generate/api-reference.mjs](file:///Users/techsquidtv/Documents/Git/canvas-timeline/apps/www/scripts/generate/api-reference.mjs)
- **Quality Gates**: [repository-policy.mjs](file:///Users/techsquidtv/Documents/Git/canvas-timeline/scripts/checks/repository-policy.mjs) | [react-registry.mjs](file:///Users/techsquidtv/Documents/Git/canvas-timeline/scripts/checks/react-registry.mjs) | [oxlint-plugin](file:///Users/techsquidtv/Documents/Git/canvas-timeline/tools/oxlint-plugin/index.mjs)

---

## Validation & Testing

Run unit tests relative to your change, then verify overall status with `vp run repo:check`.

- **Core Engine**: [engine.test.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/core/src/engine.test.ts)
- **Hooks**: [integration tests](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/react/src/hooks/integration) are split into editing, keyframe, media, and state suites with shared typed fixtures.
- **Interactions**: [ClipInteractionLayer.test.tsx](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/react/src/components/interactions/ClipInteractionLayer.test.tsx) | [tapBehavior.test.tsx](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/react/src/components/playhead/tapBehavior.test.tsx)
- **Scrollbars**: [ViewportScrollbar.test.tsx](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/react/src/components/scrollbars/ViewportScrollbar.test.tsx) | [RangeScrollbar.test.tsx](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/react/src/rangeScrollbar/RangeScrollbar.test.tsx)
- **Renderer & Theme**: [CanvasRenderer.test.tsx](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/renderer/src/CanvasRenderer.test.tsx) | [renderTimeline.test.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/renderer/src/renderTimeline.test.ts) | [theme.test.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/renderer/src/theme.test.ts)
