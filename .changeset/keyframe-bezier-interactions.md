---
---

Breaking keyframe API cleanup: replace keyframe-level `interpolation` and `easing` with generic scalar keyframe properties and side-aware `incoming`/`outgoing` interpolation data. Apps now register keyframeable properties explicitly with `createTimelineScalarKeyframeProperty()`, while core owns registered property validation, normalized evaluation, Bezier segment math, tangent geometry, and serializable render geometry.

React keyframe hooks and interaction layers now expose segment/tangent terminology, side update commands, padded hit targets, pointer-captured tangent dragging, keyboard/focus affordances, and structured `invalid-input` command failures for malformed public command input. Renderer keyframe drawing now consumes core-prepared geometry for an app-provided property id instead of normalizing clip keyframes itself.

The opacity docs demo opts into opacity as an ordinary app-registered property. No compatibility aliases, fallback readers, or opacity-specific keyframe branches are included.
