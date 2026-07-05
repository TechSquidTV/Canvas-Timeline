---
'@techsquidtv/canvas-timeline': major
'@techsquidtv/canvas-timeline-core': major
'@techsquidtv/canvas-timeline-react': major
'@techsquidtv/canvas-timeline-utils': patch
---

Add first-class clip grouping support for linked timeline edits.

This is a breaking model/API change: `TimelineState` now owns `clipGroups`,
selection supports primary-plus-many clip state, move results include
`changedClips`, and split edits are represented as a command-layer operation.
Grouped clips can be selected together, moved together, deleted/copied/pasted as
groups, and split at the playhead with group repartitioning after the cut.

React hooks now expose clip group state and commands through
`useTimelineClipGroups`, multi-selection fields through selection and clip hooks,
and split commands through `useTimelineEditCommands`.

Rational time addition/subtraction now uses a reduced common integer rate to
avoid denominator blow-ups during repeated mixed-rate edits.
