# @techsquidtv/canvas-timeline

[![npm version](https://img.shields.io/npm/v/@techsquidtv/canvas-timeline.svg)](https://www.npmjs.com/package/@techsquidtv/canvas-timeline)
[![License: MPL-2.0](https://img.shields.io/badge/license-MPL--2.0-blue.svg)](https://github.com/techsquidtv/canvas-timeline/blob/main/LICENSE)
[![CI](https://github.com/techsquidtv/canvas-timeline/actions/workflows/ci.yml/badge.svg)](https://github.com/techsquidtv/canvas-timeline/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-canvastimeline.com-0f766e.svg)](https://canvastimeline.com/packages/timeline/)

Batteries-included Canvas Timeline package for React timeline editing.

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

## Features

- Start a standard React timeline editor without choosing lower-level package boundaries first.
- Import the core engine, React provider/hooks/components, canvas renderer, and utilities from one package.
- Move gradually to focused subpath imports while keeping one dependency.

## Quick Start

```ts
import { TimelineEngine } from '@techsquidtv/canvas-timeline/core';
import { TimelineProvider } from '@techsquidtv/canvas-timeline/react';
import { CanvasRenderer } from '@techsquidtv/canvas-timeline/renderer';
import { fromSeconds } from '@techsquidtv/canvas-timeline/utils';
```

```ts
import '@techsquidtv/canvas-timeline/base.css';
import '@techsquidtv/canvas-timeline/theme.css';
```

## Documentation

- [Package docs](https://canvastimeline.com/packages/timeline/)
- [API reference](https://canvastimeline.com/packages/timeline/api)
- [Getting started](https://canvastimeline.com/docs/getting-started)
- [Demos](https://canvastimeline.com/demos/)
- [React registry](https://canvastimeline.com/packages/react/registry/)
- [GitHub source](https://github.com/techsquidtv/canvas-timeline/tree/main/packages/timeline)

## Release Status

`0.0.1` is alpha software. Breaking changes may happen before `0.1.0`, and Canvas Timeline does not keep backwards-compatibility aliases or fallback APIs during this period.
