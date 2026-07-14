---
'@techsquidtv/canvas-timeline-core': minor
'@techsquidtv/canvas-timeline-react': minor
---

Enforce playback in/out points consistently for internal and external clocks, make external looping require an awaited clock-realignment callback, replace blocking clock resumption with non-blocking activation requests, move framework-neutral media contracts into core, and report structured `TimelineMediaError` values. Media play and rate commands now await serialized adapter synchronization so asynchronous failures cannot return stale success or race later ticks. Concurrent play requests share one startup, and pausing a pending start returns a non-error `cancelled` play result while invalidating stale adapter work.
