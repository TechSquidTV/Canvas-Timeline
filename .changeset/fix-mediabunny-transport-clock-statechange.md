---
'@techsquidtv/canvas-timeline-mediabunny-adapter': patch
---

Fix the Mediabunny transport clock so a mid-playback `AudioContext` suspend no longer silently degrades to wall-clock time and jumps backward on resume. The adapter now listens for context `statechange` events, reports the suspension through `audioStatus`, and re-anchors `timelineTimeAtStart`/`audioContextStartTime` when the context resumes, keeping `getClockTime()` monotonic across suspend/resume. The controller clock writer now shares one implementation with `MediabunnyTransportClock` instead of diverging on `wallClockStartTime`.
