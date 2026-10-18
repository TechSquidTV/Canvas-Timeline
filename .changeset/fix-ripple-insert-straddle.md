---
'@techsquidtv/canvas-timeline-core': patch
---

Split clips straddling single or grouped ripple insertions while preserving source offsets and keyframe curves. Split-off clips now appear in previews and emit `clip:created` events with reason `insert-split` and origin clip lineage.
