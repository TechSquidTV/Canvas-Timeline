---
'@techsquidtv/canvas-timeline': patch
'@techsquidtv/canvas-timeline-core': patch
'@techsquidtv/canvas-timeline-react': patch
'@techsquidtv/canvas-timeline-renderer': patch
---

Replace implicit ruler frame-rate options with an explicit `format` union for seconds, timecode, and frame-number rulers. Derive editorial tick intervals from the project rate, add medium-weight subdivisions, expose reusable minimum tick spacing, and keep canvas labels inside the viewport without collisions.

**Breaking:** `frameRate` and `labelFormat` are no longer accepted as implicit ruler format selectors. Pass `{ format: 'timecode', frameRate }` or `{ format: 'frame-number', frameRate }`; use `{ format: 'seconds' }` for elapsed time. `TimelineRulerLabelFormat` has been removed, and `TimelineRulerTickKind` now also includes `medium`.
