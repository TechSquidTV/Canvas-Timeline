# @techsquidtv/canvas-timeline-core

[![npm version](https://img.shields.io/npm/v/@techsquidtv/canvas-timeline-core.svg)](https://www.npmjs.com/package/@techsquidtv/canvas-timeline-core)
[![License: MPL-2.0](https://img.shields.io/badge/license-MPL--2.0-blue.svg)](https://github.com/techsquidtv/canvas-timeline/blob/main/LICENSE)
[![Docs](https://img.shields.io/badge/docs-canvastimeline.com-0f766e.svg)](https://canvastimeline.com/packages/core/)

Standalone timeline engine for Canvas Timeline libraries.

## Install

```bash
pnpm add @techsquidtv/canvas-timeline-core
```

```ts
import {
  TimelineEngine,
  type TimelineEditCommand,
  type TimelineState,
  type Track,
} from '@techsquidtv/canvas-timeline-core';
```

## Features

- Build a timeline in a non-React environment and own rendering yourself.
- Manage track models, edit history, snapping, clipboard operations, and playback without UI dependencies.
- Write isolated unit tests around timeline business logic without loading browser DOM or canvas layers.

## Usage

```ts
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';

const engine = new TimelineEngine({
  duration: fromSeconds(30),
  tracks: [],
});

const preview = engine.previewEdit({
  type: 'move',
  clipId: 'clip-intro',
  startTime: fromSeconds(4),
});

if (preview.valid) {
  engine.commitEdit(preview.command);
}
```

```ts
import { SnapIndex } from '@techsquidtv/canvas-timeline-core/snapping';
```

## Documentation

- [Package docs](https://canvastimeline.com/packages/core/)
- [API reference](https://canvastimeline.com/packages/core/api)
- [System architecture](https://canvastimeline.com/docs/architecture)
- [Demos](https://canvastimeline.com/demos/)
- [GitHub source](https://github.com/techsquidtv/canvas-timeline/tree/main/packages/core)
