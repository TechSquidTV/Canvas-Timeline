---
'@techsquidtv/canvas-timeline-html-media-adapter': major
'@techsquidtv/canvas-timeline': minor
---

**BREAKING:** Redesign HTML media sources, React integration, recovery, and runtime controls around one app-resolved source per logical timeline asset.

Migrate the former source record to `[{ sourceId, input, fallbacks?, timing? }]`, and replace `HTMLMediaAdapterSource` with `HTMLMediaSourceInput`. The adapter no longer treats duplicate IDs as fallback variants or owns original/proxy selection; applications should select the desired original, proxy, preview, or export representation and reserve `fallbacks` for equivalent transport or cache alternatives.

React hooks now come from `@techsquidtv/canvas-timeline-html-media-adapter/react` and are no longer re-exported from the aggregate package's `./html-media` subpath. Attach the callback `mediaRef` returned by the hook instead of passing a caller-owned object ref. Use immutable `sourceStateById` snapshots for loading and attempt diagnostics, and use `retrySource()` or `replaceSource()` for explicit recovery and representation changes. Runtime volume and mute controls no longer require adapter recreation.

See the [media adapter migration guide](https://canvastimeline.com/docs/media-adapter-migration) for complete examples.
