---
'@techsquidtv/canvas-timeline-react': minor
---

Add `useTimelineClipTrim` for headless pointer trimming with Core snapping, preview, commit, cancellation, and captured start geometry. The package clip interaction layer consumes the same lifecycle and avoids layout reads during pointer moves.

Allow `useTimelineKeyboard` and `Timeline.KeyboardScope` to override individual command handlers, including asynchronous media transport, and observe settled command results or unexpected errors. Expose the command executor for custom chrome. Keyboard commands now read current engine values without document or viewport subscriptions; transport and marker hooks share the same internal command implementations. The full editor routes Space through its media-aware transport. The fixed package suite releases together.
