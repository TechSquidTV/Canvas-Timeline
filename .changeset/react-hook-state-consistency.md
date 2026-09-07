---
'@techsquidtv/canvas-timeline-core': minor
'@techsquidtv/canvas-timeline-react': minor
---

Keep history, paused active clips, content bounds, and pan/zoom constraints reactive in focused React hooks. Edit commands now read selection at invocation without subscribing to document changes. Add atomic `TimelineEngine.setInOutRange()` and expose current selected clip IDs for command integrations.

**BREAKING:** `useTimelineRangeSelection().setRange()` and `clearRange()` return `TimelineCommandResult`. Invalid or reversed ranges are rejected without mutation. In/Out controls without an explicit duration or `max` use current content bounds instead of an arbitrary 100-second limit. The fixed package group releases together.
