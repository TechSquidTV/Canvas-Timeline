---
'@techsquidtv/canvas-timeline-core': minor
'@techsquidtv/canvas-timeline-react': minor
---

**BREAKING:** Redesign externally clocked media playback around Core-owned synchronization contracts, shared playback ranges, and asynchronous transport barriers.

External clocks now enforce the same in/out and loop policy as engine playback. At the low-level `useTimelineMediaPlayback` boundary, replace the previous loop flag with a clock-realignment callback. Replace blocking `resumeClock()` implementations with non-blocking `requestClockActivation()`, and import framework-neutral media contracts such as `TimelineMediaSyncAdapter`, `TimelineLayerSyncDetails`, and `TimelineMediaError` from `@techsquidtv/canvas-timeline-core`.

Media `play()` and `setPlaybackRate()` commands are now asynchronous and must be awaited when callers need their final result. Error callbacks receive a structured `TimelineMediaError` instead of a string. Concurrent play requests share one startup; pausing a pending start returns a non-error `cancelled` result; replacing an adapter cancels stale startup work, releases its owned clock, and primes the new paused preview.

Custom `useTimelineMediaSync()` integrations that replace an underlying controller should pass it as `adapterIdentity`. Inline callback facades may omit this option and do not need to be memoized.

See the [media adapter migration guide](https://canvastimeline.com/docs/media-adapter-migration) for complete examples.
