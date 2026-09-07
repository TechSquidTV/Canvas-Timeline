---
'@techsquidtv/canvas-timeline-core': minor
'@techsquidtv/canvas-timeline-react': minor
---

Share unchanged track and clip snapshots across Core, history, and React. Track-row hooks share geometry and avoid unrelated collection subscriptions. Export `useTimelineSelector` for primitive and object selections with configurable equality, without subscribing to per-frame playback.

**BREAKING:** React state and document-derived hook values are readonly. Use engine commands for edits instead of mutating returned snapshots. Core track commands, clip selection commands, and `updateClipProperties` now return `TimelineCommandResult` instead of void or booleans; check `result.ok`. React selection commands use the same contract. Missing selection IDs return `not-found` without changing the current selection, invalid track input returns `invalid-input`, and duplicate track/clip IDs are rejected. There are no compatibility aliases.

Track commands validate current Core state, so consecutive commands in one handler work before React renders. Public examples use package imports and representative TSDoc examples compile against packed packages. Focused unit tests no longer generate API documentation.
