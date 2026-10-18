---
'@techsquidtv/canvas-timeline-core': patch
---

Clear crossed or collapsed In/Out points in individual setters and restored state, and pause loop playback when its restart point is not before the playback boundary to prevent stationary scrub event storms.
