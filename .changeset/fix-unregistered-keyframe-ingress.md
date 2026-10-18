---
'@techsquidtv/canvas-timeline-core': patch
---

Reject unregistered keyframe properties when adding tracks or placing clips, and prevent boundary edits from throwing on such properties in existing state. Empty keyframe arrays remain valid.
