# Canvas Timeline

[![npm version](https://img.shields.io/npm/v/@techsquidtv/canvas-timeline.svg)](https://www.npmjs.com/package/@techsquidtv/canvas-timeline)
[![License: MPL-2.0](https://img.shields.io/badge/license-MPL--2.0-blue.svg)](https://github.com/techsquidtv/canvas-timeline/blob/main/LICENSE)
[![CI](https://github.com/techsquidtv/canvas-timeline/actions/workflows/ci.yml/badge.svg)](https://github.com/techsquidtv/canvas-timeline/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-canvastimeline.com-0f766e.svg)](https://canvastimeline.com/docs)

Canvas Timeline is a canvas-based React timeline editor engine for video, audio,
and animation tools. It combines a headless timeline engine, React interaction
layers, and a worker-backed canvas renderer so dense editing surfaces can stay
smooth while your app owns the product UI around them.

![Canvas Timeline editor screenshot](./.github/screenshot.webp)

## Start Here

- [Documentation](https://canvastimeline.com/docs)
- [Getting started](https://canvastimeline.com/docs/getting-started)
- [Live demos](https://canvastimeline.com/demos)
- [Package docs](https://canvastimeline.com/packages)
- [React registry](https://canvastimeline.com/packages/react/registry)
- [Support & troubleshooting](https://canvastimeline.com/docs/support-and-troubleshooting)
- [Changelog](./CHANGELOG.md)
- [NPM package](https://www.npmjs.com/package/@techsquidtv/canvas-timeline)

## Install

```bash
pnpm add @techsquidtv/canvas-timeline
```

```tsx
import {
  CanvasRenderer,
  Timeline,
  TimelineEngine,
  TimelineProvider,
  fromSeconds,
} from '@techsquidtv/canvas-timeline';
import '@techsquidtv/canvas-timeline/styles.css';

const engine = new TimelineEngine({
  duration: fromSeconds(15),
  tracks: [],
});

export function EditorTimeline() {
  return (
    <TimelineProvider engine={engine}>
      <Timeline.Root>
        <CanvasRenderer />
        <Timeline.ClipInteractionLayer />
        <Timeline.PlayheadArea />
        <Timeline.PlayheadGrabber />
      </Timeline.Root>
    </TimelineProvider>
  );
}
```

## Compatibility

Canvas Timeline currently targets Node `>=24`, React `^19.2.7`, and modern
Chromium, Firefox, and Safari browsers. Headless imports from core and utils are
safe for server-side code; React components, renderer components, media
adapters, and worker-backed canvas rendering belong behind client/browser
boundaries.

The README quick start is covered by the release package gate: every public
package is packed, installed into a clean Vite/React fixture from tarballs,
typechecked, built, and checked for headless Node imports.

## Packages

Use `@techsquidtv/canvas-timeline` for the common React + canvas path, or install
focused packages when you need a lower-level layer:

| Package                                           | Purpose                                                            | README                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `@techsquidtv/canvas-timeline`                    | React timeline editing toolkit.                                    | [README](https://github.com/techsquidtv/canvas-timeline/blob/main/packages/timeline/README.md)           |
| `@techsquidtv/canvas-timeline-core`               | Headless state, editing, playback, history, snapping, and markers. | [README](https://github.com/techsquidtv/canvas-timeline/blob/main/packages/core/README.md)               |
| `@techsquidtv/canvas-timeline-react`              | Provider, hooks, and delegated interaction layers.                 | [README](https://github.com/techsquidtv/canvas-timeline/blob/main/packages/react/README.md)              |
| `@techsquidtv/canvas-timeline-renderer`           | Canvas drawing, theme resolution, and worker-backed rendering.     | [README](https://github.com/techsquidtv/canvas-timeline/blob/main/packages/renderer/README.md)           |
| `@techsquidtv/canvas-timeline-utils`              | Rational time and shared timeline math.                            | [README](https://github.com/techsquidtv/canvas-timeline/blob/main/packages/utils/README.md)              |
| `@techsquidtv/canvas-timeline-html-media-adapter` | Native HTML media element sync.                                    | [README](https://github.com/techsquidtv/canvas-timeline/blob/main/packages/html-media-adapter/README.md) |
| `@techsquidtv/canvas-timeline-mediabunny-adapter` | Optional Mediabunny-powered media integration.                     | [README](https://github.com/techsquidtv/canvas-timeline/blob/main/packages/mediabunny-adapter/README.md) |

## Repository

This monorepo contains the package source, local demos, and the Astro docs site
published at [canvastimeline.com](https://canvastimeline.com).

```bash
vp install
vp run dev
vp run dev:www
vp run repo:check
vp test
```

See [Contributing](./.github/CONTRIBUTING.md) for package boundaries,
validation, changesets, and release publishing.
