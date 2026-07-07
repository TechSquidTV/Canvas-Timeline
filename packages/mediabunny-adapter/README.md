# @techsquidtv/canvas-timeline-mediabunny-adapter

[![npm version](https://img.shields.io/npm/v/@techsquidtv/canvas-timeline-mediabunny-adapter.svg)](https://www.npmjs.com/package/@techsquidtv/canvas-timeline-mediabunny-adapter)
[![License: MPL-2.0](https://img.shields.io/badge/license-MPL--2.0-blue.svg)](https://github.com/techsquidtv/canvas-timeline/blob/main/LICENSE)
[![CI](https://github.com/techsquidtv/canvas-timeline/actions/workflows/ci.yml/badge.svg)](https://github.com/techsquidtv/canvas-timeline/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-canvastimeline.com-0f766e.svg)](https://canvastimeline.com/packages/mediabunny-adapter/)

[Mediabunny](https://mediabunny.dev/) adapter for Canvas Timeline media playback and frame access.

## Install

```bash
pnpm add @techsquidtv/canvas-timeline-mediabunny-adapter mediabunny
```

`mediabunny` and React are peer dependencies. The high-level React hook can lazy-load Mediabunny in the browser by default, while lower-level APIs can receive an explicit module or loader.

```tsx
import { useMediabunnyTimelineMedia } from '@techsquidtv/canvas-timeline-mediabunny-adapter/react';
```

## Features

- Drive decoded video frames, local media files, and Web Audio scheduling from timeline clips.
- Map `clip.sourceId` values to Mediabunny sources without storing heavy media objects in timeline state.
- Build custom canvas preview composition while keeping timeline playback synchronized.

## Quick Start

```tsx
import { useRef } from 'react';
import { useMediabunnyTimelineMedia } from '@techsquidtv/canvas-timeline-mediabunny-adapter/react';

const sources = [{ id: 'clip-source-main', url: '/media/preview.mp4' }];
const previewLayers = {
  visuals: { trackKind: 'visual', sourceId: 'clip-source-main' },
  audio: { trackKind: 'audio', sourceId: 'clip-source-main' },
} as const;

export function DecodedPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const media = useMediabunnyTimelineMedia({
    canvasRef,
    sources,
    layers: previewLayers,
  });

  return <canvas ref={canvasRef} width={1280} height={720} onClick={() => void media.play()} />;
}
```

```ts
import { createMediabunnyAdapter } from '@techsquidtv/canvas-timeline-mediabunny-adapter';
```

## Documentation

- [Package docs](https://canvastimeline.com/packages/mediabunny-adapter/)
- [API reference](https://canvastimeline.com/packages/mediabunny-adapter/api)
- [Mediabunny adapter demo](https://canvastimeline.com/demos/media-preview-sync)
- [Demos](https://canvastimeline.com/demos/)
- [Mediabunny docs](https://mediabunny.dev/)
- [GitHub source](https://github.com/techsquidtv/canvas-timeline/tree/main/packages/mediabunny-adapter)

## Release Status

`0.0.1` is alpha software. Breaking changes may happen before `0.1.0`, and Canvas Timeline does not keep backwards-compatibility aliases or fallback APIs during this period.
