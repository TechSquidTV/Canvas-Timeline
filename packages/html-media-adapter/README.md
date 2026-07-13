# @techsquidtv/canvas-timeline-html-media-adapter

[![npm version](https://img.shields.io/npm/v/@techsquidtv/canvas-timeline-html-media-adapter.svg)](https://www.npmjs.com/package/@techsquidtv/canvas-timeline-html-media-adapter)
[![License: MPL-2.0](https://img.shields.io/badge/license-MPL--2.0-blue.svg)](https://github.com/techsquidtv/canvas-timeline/blob/main/LICENSE)
[![CI](https://github.com/techsquidtv/canvas-timeline/actions/workflows/ci.yml/badge.svg)](https://github.com/techsquidtv/canvas-timeline/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-canvastimeline.com-0f766e.svg)](https://canvastimeline.com/packages/html-media-adapter/)

HTMLMediaElement adapter for Canvas Timeline media playback.

## Install

```bash
pnpm add @techsquidtv/canvas-timeline-html-media-adapter
```

The root export is framework-free. Install the optional React peers when using the `./react` hooks.

```tsx
import { useHTMLTimelineMedia } from '@techsquidtv/canvas-timeline-html-media-adapter/react';
```

## Features

- Build a standard video or audio preview player with a native `<video>` or `<audio>` element.
- Synchronize one mounted HTML media element to Canvas Timeline playback.
- Keep Blob, File, and object URL media data outside serialized timeline state.

## Quick Start

```tsx
import { useRef } from 'react';
import { useHTMLTimelineMedia } from '@techsquidtv/canvas-timeline-html-media-adapter/react';

const sources = [
  {
    sourceId: 'clip-source-main',
    input: '/media/preview.mp4',
  },
] as const;
const previewLayers = {
  visuals: { trackKind: 'visual', sourceId: 'clip-source-main' },
} as const;

export function NativePreview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const media = useHTMLTimelineMedia({
    ref: videoRef,
    sources,
    layers: previewLayers,
  });

  return <video ref={videoRef} playsInline onClick={() => void media.play()} />;
}
```

Each source describes one media choice already resolved by your application. Use `fallbacks` only for equivalent ways to load that choice. Keep originals, editing proxies, optimized previews, and export media in your media library, then switch the adapter with `media.adapter.replaceSource(...)`. Include a `timing` anchor when the resolved media uses a different timestamp origin.

The React hook reconciles ordinary URL descriptors by value, so callers may pass an inline source array without causing adapter disposal or media reload. Imperative consumers can update the complete registry with `setSources(...)`.

```ts
import { createHTMLMediaAdapter } from '@techsquidtv/canvas-timeline-html-media-adapter';
```

## Documentation

- [Package docs](https://canvastimeline.com/packages/html-media-adapter/)
- [API reference](https://canvastimeline.com/packages/html-media-adapter/api)
- [HTML media sync demo](https://canvastimeline.com/demos/html-media-sync)
- [Demos](https://canvastimeline.com/demos/)
- [GitHub source](https://github.com/techsquidtv/canvas-timeline/tree/main/packages/html-media-adapter)
