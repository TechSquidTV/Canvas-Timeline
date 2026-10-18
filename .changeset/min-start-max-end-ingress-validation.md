---
'@techsquidtv/canvas-timeline-core': patch
---

Reject trim commands whose post-trim bounds violate the clip's `minStart`/`maxEnd` locks and reject insert/overwrite placements that violate their own locks, instead of accepting them or throwing during trim resolution.
