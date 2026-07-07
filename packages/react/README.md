# @techsquidtv/canvas-timeline-react

[![npm version](https://img.shields.io/npm/v/@techsquidtv/canvas-timeline-react.svg)](https://www.npmjs.com/package/@techsquidtv/canvas-timeline-react)
[![License: MPL-2.0](https://img.shields.io/badge/license-MPL--2.0-blue.svg)](https://github.com/techsquidtv/canvas-timeline/blob/main/LICENSE)
[![CI](https://github.com/techsquidtv/canvas-timeline/actions/workflows/ci.yml/badge.svg)](https://github.com/techsquidtv/canvas-timeline/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-canvastimeline.com-0f766e.svg)](https://canvastimeline.com/packages/react/)

React bindings, hooks, and interaction components for Canvas Timeline.

## Install

```bash
pnpm add @techsquidtv/canvas-timeline-react
```

This package expects React and React DOM peer dependencies compatible with the package manifest.

```tsx
import { Timeline, TimelineProvider, useTimeline } from '@techsquidtv/canvas-timeline-react';
import '@techsquidtv/canvas-timeline-react/styles.css';
```

## Features

- Bind a `TimelineEngine` instance to React components, controls, and state subscriptions.
- Use hooks for clips, tracks, selection, playback, viewport state, history, clipboard, and edit commands.
- Add pointer-captured interaction layers for selection, drag, trim, playhead scrubbing, and custom scrollbars.

## Quick Start

```tsx
import { Timeline } from '@techsquidtv/canvas-timeline-react';
import '@techsquidtv/canvas-timeline-react/styles.css';

export function TimelineChrome() {
  return (
    <Timeline.Root>
      <Timeline.ClipInteractionLayer />
      <Timeline.PlayheadArea />
      <Timeline.PlayheadGrabber />
    </Timeline.Root>
  );
}
```

```ts
import {
  useTimelineClips,
  useTimelineEditCommands,
  useTimelineEditImpacts,
  useTimelineSelection,
} from '@techsquidtv/canvas-timeline-react/hooks';
```

```ts
import '@techsquidtv/canvas-timeline-react/base.css';
import '@techsquidtv/canvas-timeline-react/theme.css';
```

## Documentation

- [Package docs](https://canvastimeline.com/packages/react/)
- [API reference](https://canvastimeline.com/packages/react/api)
- [React registry](https://canvastimeline.com/packages/react/registry/)
- [Demos](https://canvastimeline.com/demos/)
- [GitHub source](https://github.com/techsquidtv/canvas-timeline/tree/main/packages/react)

## Release Status

`0.0.1` is alpha software. Breaking changes may happen before `0.1.0`, and Canvas Timeline does not keep backwards-compatibility aliases or fallback APIs during this period.
