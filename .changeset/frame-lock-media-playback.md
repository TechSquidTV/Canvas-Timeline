---
'@techsquidtv/canvas-timeline-mediabunny-adapter': major
'@techsquidtv/canvas-timeline-react': minor
---

Add optional project-frame-locked media playback and switch Mediabunny video preview playback to a buffered sequential decoder.

This is a breaking Mediabunny React API change: `useMediabunnyTimelineMedia()` no longer returns `lastFrameTime`. Subscribe to decoded preview frames with `useMediabunnyFrameTime(result.adapter)` instead.
