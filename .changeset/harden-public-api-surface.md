---
---

Harden the public package surface before the first public release.

This is a breaking API cleanup: React timecode input no longer re-exports
timecode parsing, formatting, or option aliases. Use the canonical helpers and
types from `@techsquidtv/canvas-timeline-utils/timecode` instead.

React provider context internals and docs registry metadata are no longer part
of the React package's public API. Use `TimelineProvider`, `useTimeline`, and
`useTimelineState` for runtime integration; the docs site now owns hook registry
metadata directly.

Core no longer exposes internal snapshot helpers or the internal typed event
emitter through the root package barrel. These remain implementation details of
the engine, history, and clipboard internals.
