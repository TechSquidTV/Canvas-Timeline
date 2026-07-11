---
name: manage-live-demos
description: Manage source-backed Canvas Timeline docs demos as live QA tools. Use when adding, updating, debugging, or validating demos under apps/www/src/demos; wiring demo registry entries and code tabs; keeping live demos and displayed examples from drifting; or checking demo package-readiness, styles, hit targets, scrollbars, and build verification.
---

# Manage Live Demos

## Core Rule

Treat every docs demo as executable source, not prose with matching snippets. The live renderer and the code tabs must consume the same demo module files so the docs become a QA surface: if the example source breaks, the live demo or docs build should break too.

## Source Layout

Use one folder per demo under `apps/www/src/demos/<demo-slug>/`.

Each source-backed demo should include:

```text
apps/www/src/demos/<demo-slug>/
├── <DemoComponent>.tsx
├── timeline-demo-data.ts
└── timeline-editor.css
```

Keep demo source copy-friendly:

- Import only published package APIs from `@techsquidtv/canvas-timeline-*`.
- Import required package CSS with `@techsquidtv/canvas-timeline-react/styles.css`.
- Use relative local imports like `./timeline-demo-data` and `./timeline-editor.css`.
- Avoid `@/` aliases inside demo source files.
- Use `demo` naming for fixture data only.
- Use reusable CSS class names such as `timeline-editor-*`; avoid `demo-*` for classes a consumer might copy.

Displayed snippets are projected into public-package copy form through
`apps/www/src/data/demo-snippets.ts`. Live source can import focused workspace
packages, but code tabs should pass component, data, and utility raw strings
through `toCopyableDemoSource(...)` so package imports and CSS imports are
rewritten together.

## Registry Contract

Wire source-backed demos through two registries:

- `apps/www/src/data/demo-components.ts`: lazy live component loaders used by
  `LiveDemoRenderer`.
- `apps/www/src/data/demo-code.ts`: raw source used by code tabs and demo
  verification.

Each `demo-code.ts` entry must pair:

- `tsx`: raw source from `<DemoComponent>.tsx?raw`.
- `data`: raw source from `timeline-demo-data.ts?raw`.
- `css`: raw source from `timeline-editor.css?raw`.
- `extraTabs`: optional utility source tabs when a demo needs supporting files.
- `sourceFiles`: the files the verification script should check.

Do not reintroduce hand-authored component/data/style strings for code tabs. Raw imports are the guardrail against drift.
Do not import live React components in `demo-code.ts`; keep runtime component
loading in `demo-components.ts` so raw code tabs do not force every demo into
the main docs bundle.
Do not pass raw component, data, or utility source directly to code tabs; use the shared
copyable snippet projection so examples keep matching the intended public
package install shape.

## Docs Metadata

Add or update the matching docs metadata in `apps/www/src/data/demos.ts`.

For demos that render live, `liveDemoId` must match keys in `demoCodeExamples`
and `liveDemoLoaders`. The `sourcePath` should point at the actual component
file under `apps/www/src/demos/<demo-slug>/`.

The demo page at `apps/www/src/pages/demos/[slug].astro` should render live demos through `LiveDemoRenderer` and show code tabs through `CodeExampleTabs`.

## Preferred Workflow

When adding a new demo, prefer the scaffold:

```bash
vp run --filter @techsquidtv/canvas-timeline-www docs:demo:new <demo-slug> <liveDemoId> <DemoComponent> [Title]
```

If the script interface has changed, inspect `apps/www/scripts/demos/scaffold.mjs` before running it.

After scaffolding:

1. Replace placeholder track, clip, marker, and component behavior with the intended scenario.
2. Keep behavior-critical layout in the React package base stylesheet, not in demo CSS.
3. For custom playhead or In/Out affordances, use `Timeline.PlayheadGrabber`
   children and `Timeline.RangeSelector` `inPointChildren`/`outPointChildren`
   render props. Do not use demo CSS to hide or replace built-in structural
   pieces.
4. Keep `timeline-editor.css` focused on intentional theme choices: colors, frame treatment, selected states, scrollbar grip visuals, spacing, and composition.
5. Update docs metadata labels, summary, and links.
6. Run the verifier and docs build.

## Validation

Always run:

```bash
vp run --filter @techsquidtv/canvas-timeline-www docs:demos
vp run --filter @techsquidtv/canvas-timeline-www build
```

Run package builds when demo work touches exported package code or base styles:

```bash
vp run build:packages
```

The demo verifier should fail when:

- A docs `liveDemoId` has no registry entry.
- A registry entry has no docs metadata.
- A code tab source file is missing.
- A live demo entry is missing component, data, styles, or utility source files.

## QA Expectations

Use demos to catch integration regressions that unit tests can miss:

- Clips render on the intended tracks.
- Clip center hit targets select or drag the correct clip.
- Dragging one clip never moves another track's clip.
- Playhead, marker, and In/Out hit areas align with the visual timeline.
- Playhead and In/Out grabbers move smoothly while dragging, scrolling,
  zooming, and playing back.
- Unset In/Out points stay hidden. Demos that need visible In/Out grabbers
  should set them inside that demo only with `engine.setInPoint` and
  `engine.setOutPoint`.
- `CanvasRenderer` plus `Timeline.RangeSelector` should not double-paint
  In/Out endpoint lines. Leave `showInOutBoundaryLines` at its default `false`
  when DOM RangeSelector grabbers are mounted; use it only for renderer-only
  compositions without DOM boundary grabbers.
- Scrollbar thumbs, handles, and grip visuals are visible when themed.
- There are no fixed-position overlay artifacts that remain while the timeline scrolls.
- The docs page shows `Component`, `Data`, `Styles`, and any expected utility tabs.

If the user asks to skip browser automation, respect that and verify with the demo verifier, build, direct route loading, and screenshots only when appropriate.

## Styling Boundary

For package-readiness, imported components must work structurally with:

```ts
import '@techsquidtv/canvas-timeline-react/styles.css';
```

Demo CSS may theme and compose. Demo CSS must not be required to fix geometry, hit testing, pointer-event layering, clip positioning, playhead positioning, track layout, or scrollbar structure.

`CanvasRenderer` owns dense canvas visuals and optional range fill. React owns
interactive DOM chrome such as `Timeline.PlayheadGrabber` and the high-level
`Timeline.RangeSelector` In/Out grabbers. If a demo exposes custom grabber
heads, implement them through the component render props and keep structural
geometry in `packages/react/src/base.css`.

If a demo needs structural CSS to function, move the required rule into the React package base stylesheet and keep the public component API stable.

## Public API Promotion Gate

When a demo exposes a composition inconvenience, do not immediately add a package component.
Before exporting a React component or moving demo layout into package CSS, check:

- Does it bind timeline state, behavior, accessibility, or interaction semantics?
- Would consumers expect Canvas Timeline to support this exact shape long-term?
- Is this layout required for exported timeline primitives to function with package CSS alone?
- Is it more than a styled wrapper around app-owned primitives such as shadcn or `react-resizable-panels`?

If the answer is mostly no, keep the composition in demo/app CSS and copyable demo source.
Examples that should usually stay demo-owned: resizable panel groups, sidebars, inspectors,
media panels, split editor shells, page framing, and wrappers around third-party UI primitives.
