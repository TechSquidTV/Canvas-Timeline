---
'@techsquidtv/canvas-timeline-mediabunny-adapter': minor
---

Redesign Mediabunny sources around concise app-resolved inputs, direct URL/Request/Blob/File shorthand, equivalent transport fallbacks, timestamp mapping, immutable state snapshots, shared operation results, source metadata and track selection, runtime recovery, lazy active-source loading with explicit preload/unload controls, lazy owned audio graphs, and non-blocking audio activation diagnostics. The framework-free root no longer imports React, and React hooks reconcile inline-equivalent descriptors without adapter recreation. Adapter-owned proxy selection is removed without a compatibility alias.
