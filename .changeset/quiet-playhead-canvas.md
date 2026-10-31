---
'@techsquidtv/canvas-timeline-renderer': minor
---

Skip built-in canvas worker messages and redraws for playhead-only scrubbing and playback updates. DOM playheads continue updating, and custom canvas layers retain the `redrawOnPlayhead` option.

**BREAKING:** Remove `playhead` from `CanvasRendererRenderReason` because playhead-only updates no longer trigger worker draws. Remove handlers for that diagnostic reason. Custom canvas layer render reasons are unchanged.
