---
'@techsquidtv/canvas-timeline-utils': minor
'@techsquidtv/canvas-timeline-core': minor
'@techsquidtv/canvas-timeline-react': minor
'@techsquidtv/canvas-timeline-renderer': minor
'@techsquidtv/canvas-timeline-html-media-adapter': minor
'@techsquidtv/canvas-timeline-mediabunny-adapter': minor
'@techsquidtv/canvas-timeline': minor
---

Fix playback at low tick rates, fractional-time HTML media recovery, and drop-frame
timecode cache collisions. Restore saved playback ranges, own constructor time
values, and reject invalid track-height batches before applying any changes.

**BREAKING:** Geometry, active-media, and keyframe queries now expose readonly
document records. Accept `TimelineReadonly<Clip>` and `TimelineReadonly<Track>` in
read-only helpers, and use engine commands to edit the document. Metadata uses
`TimelineMetadata`: plain objects and arrays of strings, finite numbers, booleans,
`null`, or `undefined`. Move Maps, Sets, Dates, buffers, class instances, and cyclic
data into application-owned stores keyed by clip or source ID. These values are
rejected instead of being retained in mutable history snapshots.
