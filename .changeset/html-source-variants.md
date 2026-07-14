---
'@techsquidtv/canvas-timeline-html-media-adapter': minor
'@techsquidtv/canvas-timeline': minor
---

Redesign HTML media sources around one app-resolved input, equivalent transport fallbacks, timestamp mapping, truthful native loading state, immutable state snapshots, explicit registry/retry/replacement operations, coordinated fallback startup, and volume and mute controls. Move React hooks to the optional `./react` export, including removal from the aggregate package's `./html-media` subpath, return an owned callback ref for native element attachment, and reconcile inline-equivalent descriptors without adapter recreation. Adapter-owned proxy selection and caller-supplied object refs are removed without compatibility aliases.
