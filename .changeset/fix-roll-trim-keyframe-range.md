---
'@techsquidtv/canvas-timeline-core': patch
---

Fix roll-trim edits leaving stale out-of-range keyframes. Roll-trim now clips each affected clip's keyframes to its new timeline range with curve-preserving boundary keys, matching plain trim, split, overwrite, and range-removal behavior.
