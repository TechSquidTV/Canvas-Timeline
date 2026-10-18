---
'@techsquidtv/canvas-timeline-core': patch
---

Treat the content-derived end as a playback boundary when no explicit duration is set, so `play({ loop: true })` wraps at content end instead of pinning the playhead. Empty timelines now pause instead of spinning at zero, including zero-time external-clock ticks. Implicit auto-end targets track content edits during playback (explicit `toTime` targets are unchanged), and `ExternalPlaybackUpdate.reason` may report `duration` instead of `target` when auto-end resolves to the content end.
