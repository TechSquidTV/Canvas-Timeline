---
'@techsquidtv/canvas-timeline-core': minor
'@techsquidtv/canvas-timeline': minor
---

Split clips straddling single or grouped ripple insertions while preserving source offsets and keyframe curves. Split-off clips now appear in previews and emit `clip:created` events with reason `insert-split` and origin clip lineage.

**BREAKING:** `ClipCreatedReason` includes `insert-split`. Update exhaustive switches and `clip:created` handlers to handle the new reason and use `originClipId` to identify the source clip.
