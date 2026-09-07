---
'@techsquidtv/canvas-timeline-core': minor
'@techsquidtv/canvas-timeline-react': minor
'@techsquidtv/canvas-timeline-renderer': minor
'@techsquidtv/canvas-timeline-utils': minor
'@techsquidtv/canvas-timeline': minor
---

Unify editing around validated preview/commit transactions, including atomic clipboard batches. Commits re-evaluate current state, preserving intervening edits and current locks/policy. Pointer cancellation discards clip previews.

**BREAKING:** replace direct engine clip mutators with `commitEdit`; use `engine.geometry`, `engine.media`, and `engine.keyframes` for their respective queries and operations. Engine read snapshots and rational times are readonly. React context carries only the engine; use `useTimelineEngine` for imperative access. Hook/geometry APIs no longer accept an unchecked track-kind generic. Command results now discriminate success payloads and failure reasons. RangeScrollbar exposes only axis-neutral thumb offset/size names. Query first content explicitly with `engine.media.getFirstContentTime`.

Bound history by entries and serialized bytes, share unchanged history records, index active media intervals, isolate React state subscriptions, and coalesce worker updates without resending document content for viewport-only changes. Migrate package consumers and docs together.
