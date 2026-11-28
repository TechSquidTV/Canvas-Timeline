---
'@techsquidtv/canvas-timeline-core': minor
---

**BREAKING:** Loading a timeline now rejects duplicate track IDs or duplicate clip IDs, matching the uniqueness requirement for added tracks. Assign unique IDs and update references in persisted documents before loading them.
