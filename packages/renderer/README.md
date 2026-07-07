# @techsquidtv/canvas-timeline-renderer

[![npm version](https://img.shields.io/npm/v/@techsquidtv/canvas-timeline-renderer.svg)](https://www.npmjs.com/package/@techsquidtv/canvas-timeline-renderer)
[![License: MPL-2.0](https://img.shields.io/badge/license-MPL--2.0-blue.svg)](https://github.com/techsquidtv/canvas-timeline/blob/main/LICENSE)
[![CI](https://github.com/techsquidtv/canvas-timeline/actions/workflows/ci.yml/badge.svg)](https://github.com/techsquidtv/canvas-timeline/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-canvastimeline.com-0f766e.svg)](https://canvastimeline.com/packages/renderer/)

Canvas renderer and worker-backed drawing primitives for Canvas Timeline.

## Install

```bash
pnpm add @techsquidtv/canvas-timeline-renderer
```

This package expects a React peer dependency compatible with the package manifest.

```tsx
import {
  CanvasRenderer,
  createTimelineRendererTheme,
  defaultTimelineRendererTheme,
  getPresetColor,
} from '@techsquidtv/canvas-timeline-renderer';
```

## Features

- Render dense track lines, clips, ticks, markers, and feedback guides on canvas.
- Keep high-frequency drawing out of React while using DOM interaction chrome for low-count controls.
- Resolve Canvas Timeline and shadcn-compatible CSS variables into canvas paint settings.

## Usage

```tsx
import { CanvasRenderer } from '@techsquidtv/canvas-timeline-renderer';

export function TimelineCanvas() {
  return <CanvasRenderer themeKey="light" />;
}
```

```ts
import {
  createTimelineRendererTheme,
  defaultTimelineRendererTheme,
  resolveTimelineRendererThemeFromElement,
} from '@techsquidtv/canvas-timeline-renderer/theme';
```

## Documentation

- [Package docs](https://canvastimeline.com/packages/renderer/)
- [API reference](https://canvastimeline.com/packages/renderer/api)
- [System architecture](https://canvastimeline.com/docs/architecture)
- [Demos](https://canvastimeline.com/demos/)
- [GitHub source](https://github.com/techsquidtv/canvas-timeline/tree/main/packages/renderer)

## Release Status

`0.0.1` is alpha software. Breaking changes may happen before `0.1.0`, and Canvas Timeline does not keep backwards-compatibility aliases or fallback APIs during this period.
