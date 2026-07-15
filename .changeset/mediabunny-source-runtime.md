---
'@techsquidtv/canvas-timeline-mediabunny-adapter': minor
---

**BREAKING:** Redesign Mediabunny sources and controller lifecycle around concise app-resolved inputs, lazy loading, explicit recovery, and the shared Core media contract.

Migrate `{ id, url | blob | createInput }` sources to `{ sourceId, input, fallbacks?, timing? }`. Plain URL, `URL`, `Request`, `Blob`, and `File` values can be passed directly; object inputs provide custom formats, `UrlSource` options, supplied inputs, or input factories. The adapter no longer owns original/proxy selection. Applications should resolve the representation they want and reserve `fallbacks` for equivalent delivery alternatives.

`MediabunnyAdapter` now implements `TimelineMediaSyncAdapter` directly, so pass the adapter instead of the removed nested `syncAdapter` facade. Replace `durationBySourceId` with immutable `sourceStateById` metadata and attempt diagnostics. The high-level React hook returns its owned `canvasRef`; the low-level hook accepts a resolved canvas element. Sources load when active, with `preloadSource()`, `unloadSource()`, `retrySource()`, and `replaceSource()` available for explicit lifecycle control. Audio graphs are created only for decodable audio tracks, and caller-provided `AudioContext` instances remain caller-owned.

See the [media adapter migration guide](https://canvastimeline.com/docs/media-adapter-migration) for complete examples.
