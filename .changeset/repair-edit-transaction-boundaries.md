---
'@techsquidtv/canvas-timeline-core': patch
'@techsquidtv/canvas-timeline-react': patch
---

Validate keyframe updates before changing document state, enforce roll-trim bounds, and return owned marker copies. Restore history with cleared edit previews and valid viewport bounds. Keep clip drag and trim previews owned by their initiating gesture, and refresh paused media when effective layer selections change.
