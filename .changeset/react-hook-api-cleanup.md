---
'@techsquidtv/canvas-timeline-react': minor
---

Simplify the React hook catalog and keep track lock controls independent of row geometry. Domain commands normalize expected input-validation errors to `invalid-input`, while unexpected errors still propagate. Correct hook subscription metadata and the imperative time-position description.

**BREAKING:** Replace `useTimelineViewportScrollbar` with `useTimelineViewportRangeControl`, and `useTimelineVerticalScrollbar` with `useTimelineVerticalRangeControl`; accessibility formatting is now included in each canonical adapter. Replace their options/results/root-prop types with the corresponding RangeControl types. Replace `useTimelineEditMode` with application-owned `useState`. Read all clip/group selection from `useTimelineSelection`, not `useTimelineClips` or `useTimelineClipGroups`. Use geometry hooks or `engine.geometry` for clip rectangles/hit testing and `engine.media` for source-time mapping. React track toggles only toggle: replace explicit boolean arguments with `setMuted`, `setVisible`, `setLocked`, or `setTrackTarget`. No compatibility aliases remain. All seven public packages release together.
