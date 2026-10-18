---
'@techsquidtv/canvas-timeline-core': patch
---

Fix `getFirstContentTime` returning the first matching clip in array order instead of the true earliest start when track clips are not sorted by `timelineStart` (for example when built from initial state or `addTrack`). Playback integrations that auto-seek to first content now land on the earliest matching clip.
