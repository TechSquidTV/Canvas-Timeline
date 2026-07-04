---
'@techsquidtv/canvas-timeline-core': patch
'@techsquidtv/canvas-timeline-react': patch
---

Improve keyframe and Bezier curve handle interactions. Keyframe and curve handles now render invisible padded hit targets (new `hitPadding` prop) around their visual shapes so near-miss presses grab the handle instead of falling through to the clip interaction layer. The curve layer gained guarded pointer capture with document-level fallback listeners and now selects the anchor keyframe on drag start. Keyframe drag previews are non-destructive: colliding neighbors are no longer deleted during `{ commit: false }` updates, only on committed edits. New keyframes created without an explicit `interpolation` inherit the previous keyframe's interpolation mode and Bezier easing.
