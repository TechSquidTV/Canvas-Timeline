---
'@techsquidtv/canvas-timeline-core': minor
'@techsquidtv/canvas-timeline-react': minor
'@techsquidtv/canvas-timeline-renderer': minor
---

Preserve animation curves when inserting keys, trimming, and splitting. Route keyframe edits through atomic preview/commit/cancel commands with non-destructive collision rejection and one undo step per gesture. Add multi-selection, group dragging, keyframe-only copy/paste, frame-aware snapping/nudges, linked tangents, and delegated keyboard/pointer layers with constant DOM size. Separate settled React keyframe state from scoped live geometry. Expand the source-backed demo with exact fields, curve presets, and a taller curve lane.

**BREAKING:** Bezier handle Y is now an absolute normalized property value. Migrate each saved segment's explicit handles using `newY = normalize(left.value) + (normalize(right.value) - normalize(left.value)) * oldY` before loading the project. X is unchanged; omitted handles resolve dynamically from endpoint values. Replace `selectClipKeyframe` with `selectKeyframes`; `keyframe:select` now emits a reference array. Move point geometry reads/options to `useTimelineKeyframeGeometry`. Replace removed `startDrag`/`endDrag` calls with command preview/commit/cancel; `{ commit: false }` no longer mutates persisted state. Geometry control-point helpers require value-lane bounds, and double-click callbacks carry native pointer events. See the Keyframes migration guide. The seven public packages release together as the fixed pre-1.0 suite; no compatibility aliases or automatic data conversions are included.
