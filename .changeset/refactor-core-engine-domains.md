---
'@techsquidtv/canvas-timeline-core': major
---

Refactor timeline engine internals into editing and keyframe domains.

`insertClipGroup()` now delegates to the grouped insert command pipeline, so direct grouped insertion uses the same validation, edit policy, snapping, ripple behavior, events, and history semantics as `commitEdit({ type: 'insert-clip-group' })`.
