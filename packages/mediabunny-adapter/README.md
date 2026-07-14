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

`mediabunny` is a peer dependency. React and the Canvas Timeline React package are optional peers used only by the `./react` export. The framework-free root does not import React.

## Choosing an API

- Start with `useMediabunnyTimelineMedia` in React apps. It creates the adapter, connects it to timeline playback, and returns play/pause/rate controls plus decoded-frame status.
- Use `useMediabunnyAdapter` only when you want React lifecycle management but will wire the returned adapter into `useTimelineMediaSync` yourself.
- Use `createMediabunnyAdapter` outside React or when custom infrastructure owns canvas assignment, transport wiring, and disposal.
- Use the HTML media adapter instead when one native `<video>` or `<audio>` element is enough.

```tsx
import { useMediabunnyTimelineMedia } from '@techsquidtv/canvas-timeline-mediabunny-adapter/react';
```

## Features

- Use Mediabunny to decode video frames and audio buffers, then keep canvas drawing and Web Audio playback aligned with timeline clips.
- Map `clip.sourceId` values to Mediabunny sources without storing heavy media objects in timeline state.
- Build a custom timeline preview monitor without storing files, blobs, or decoded frames in timeline state.
- Load only active or explicitly preloaded sources and release decoder resources without removing definitions.
- Select alternate video/audio tracks and inspect timing, dimensions, frame-rate, audio, and fallback diagnostics.

## Quick Start

```tsx
import type { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { TimelineProvider } from '@techsquidtv/canvas-timeline-react';
import { useMediabunnyTimelineMedia } from '@techsquidtv/canvas-timeline-mediabunny-adapter/react';

const sourceId = 'clip-source-main';
const sources = [
  {
    sourceId,
    input: '/media/preview.mp4',
  },
] as const;
const previewLayers = {
  visuals: { trackKind: 'visual', sourceId },
  audio: { trackKind: 'audio', sourceId },
} as const;

export function DecodedPreviewApp({ engine }: { engine: TimelineEngine }) {
  return (
    <TimelineProvider engine={engine}>
      <DecodedPreview />
    </TimelineProvider>
  );
}

function DecodedPreview() {
  const media = useMediabunnyTimelineMedia({
    sources,
    layers: previewLayers,
  });

  return (
    <canvas ref={media.canvasRef} width={1280} height={720} onClick={() => void media.play()} />
  );
}
```

Each item in `sources` uses a `sourceId` matching timeline clips and one app-resolved `input`. Common inputs can be passed directly as a URL string, `URL`, `Request`, `Blob`, or `File`; use the object descriptors for custom URL formats/options, supplied inputs, and factories. Add `fallbacks` only for equivalent ways to load the resolved media. Keep original/proxy policy in your media library and switch choices with `replaceSource(...)`, including a `timing` anchor when timestamps differ from logical source time. The adapter exposes input attempts, timing, dimensions, and frame-rate metadata through `sourceStateById`.

Sources load on demand when their clips become active. Use `preloadSource(sourceId)` to warm likely next clips and `unloadSource(sourceId)` to release decoder resources without removing the source. React source arrays do not need stable identity for ordinary URL descriptors; keep factories, selectors, and custom option objects stable because their identity represents executable policy.

`ready` means at least one source is registered, not that every project asset is decoded. Read `sourceStateById` for each source's lazy lifecycle and `audioStatus` for browser activation degradation. Caller-supplied `AudioContext` and destination nodes remain caller-owned; the adapter creates an audio graph only for a selected decodable audio track. Runtime `setVolume()` and `setMuted()` changes do not reload sources.

The adapter implements `TimelineMediaSyncAdapter` directly. Its transport clock is independent of loaded source controllers, so lazy source changes and runtime fallback recovery preserve timeline time. Lazy module-loader failures are observable operation failures and `retrySource()` invokes the loader again.

High-level React playback applies Core in/out and loop policy to the external clock. Paused preview, startup, loop, tick, pause, and rate operations are ordered so delayed lazy loading or decoding cannot overwrite a newer position. Concurrent `play()` calls share one pending startup; `pause()` cancels pending work with a non-error `cancelled` play result. `onError` receives a `TimelineMediaError` with a stable `reason`, including `sync-failed` for rendering or scheduling failures. Audio activation is requested without blocking visual transport, retained until a decodable audio track loads, and never resumes a supplied context for video-only media. If activation completes after visual playback has advanced, queued audio is discarded and scheduled again from the current transport position.

## Documentation

- [Package docs](https://canvastimeline.com/packages/mediabunny-adapter/)
- [API reference](https://canvastimeline.com/packages/mediabunny-adapter/api)
- [Media adapter guide](https://canvastimeline.com/docs/media-adapters)
- [Breaking migration guide](https://canvastimeline.com/docs/media-adapter-migration)
- [Mediabunny adapter demo](https://canvastimeline.com/demos/media-preview-sync)
- [Demos](https://canvastimeline.com/demos/)
- [Mediabunny docs](https://mediabunny.dev/)
- [GitHub source](https://github.com/techsquidtv/canvas-timeline/tree/main/packages/mediabunny-adapter)
