# @techsquidtv/canvas-timeline-core

## 0.3.0

### Minor Changes

- [#90](https://github.com/TechSquidTV/Canvas-Timeline/pull/90) [`473ada4`](https://github.com/TechSquidTV/Canvas-Timeline/commit/473ada4bbc520ed135336aa7aee3620dc332f930) Thanks [@KyleTryon](https://github.com/KyleTryon)! - Preserve animation curves when inserting keys, trimming, and splitting. Route keyframe edits through atomic preview/commit/cancel commands with non-destructive collision rejection and one undo step per gesture. Add multi-selection, group dragging, keyframe-only copy/paste, frame-aware snapping/nudges, linked tangents, and delegated keyboard/pointer layers with constant DOM size. Separate settled React keyframe state from scoped live geometry. Expand the source-backed demo with exact fields, curve presets, and a taller curve lane.

  **BREAKING:** Bezier handle Y is now an absolute normalized property value. Migrate each saved segment's explicit handles using `newY = normalize(left.value) + (normalize(right.value) - normalize(left.value)) * oldY` before loading the project. X is unchanged; omitted handles resolve dynamically from endpoint values. Replace `selectClipKeyframe` with `selectKeyframes`; `keyframe:select` now emits a reference array. Move point geometry reads/options to `useTimelineKeyframeGeometry`. Replace removed `startDrag`/`endDrag` calls with command preview/commit/cancel; `{ commit: false }` no longer mutates persisted state. Geometry control-point helpers require value-lane bounds, and double-click callbacks carry native pointer events. See the Keyframes migration guide. The seven public packages release together as the fixed pre-1.0 suite; no compatibility aliases or automatic data conversions are included.

### Patch Changes

- Updated dependencies []:
  - @techsquidtv/canvas-timeline-utils@0.3.0

## 0.2.0

### Minor Changes

- [#85](https://github.com/TechSquidTV/Canvas-Timeline/pull/85) [`e26b3f6`](https://github.com/TechSquidTV/Canvas-Timeline/commit/e26b3f6f818a5f3ddbd8fe6b51c5dbff3003ae7b) Thanks [@KyleTryon](https://github.com/KyleTryon)! - Fix playback at low tick rates, fractional-time HTML media recovery, and drop-frame
  timecode cache collisions. Restore saved playback ranges, own constructor time
  values, and reject invalid track-height batches before applying any changes.

  **BREAKING:** Geometry, active-media, and keyframe queries now expose readonly
  document records. Accept `TimelineReadonly<Clip>` and `TimelineReadonly<Track>` in
  read-only helpers, and use engine commands to edit the document. Metadata uses
  `TimelineMetadata`: plain objects and arrays of strings, finite numbers, booleans,
  `null`, or `undefined`. Move Maps, Sets, Dates, buffers, class instances, and cyclic
  data into application-owned stores keyed by clip or source ID. These values are
  rejected instead of being retained in mutable history snapshots.

- [#60](https://github.com/TechSquidTV/Canvas-Timeline/pull/60) [`ceb3dd4`](https://github.com/TechSquidTV/Canvas-Timeline/commit/ceb3dd494a3c3cadc102630803f810dfe3e75b05) Thanks [@KyleTryon](https://github.com/KyleTryon)! - **BREAKING:** Redesign externally clocked media playback around Core-owned synchronization contracts, shared playback ranges, and asynchronous transport barriers.

  External clocks now enforce the same in/out and loop policy as engine playback. At the low-level `useTimelineMediaPlayback` boundary, replace the previous loop flag with a clock-realignment callback. Replace blocking `resumeClock()` implementations with non-blocking `requestClockActivation()`, and import framework-neutral media contracts such as `TimelineMediaSyncAdapter`, `TimelineLayerSyncDetails`, and `TimelineMediaError` from `@techsquidtv/canvas-timeline-core`.

  Media `play()` and `setPlaybackRate()` commands are now asynchronous and must be awaited when callers need their final result. Error callbacks receive a structured `TimelineMediaError` instead of a string. Concurrent play requests share one startup; pausing a pending start returns a non-error `cancelled` result; replacing an adapter cancels stale startup work, releases its owned clock, and primes the new paused preview.

  Custom `useTimelineMediaSync()` integrations that replace an underlying controller should pass it as `adapterIdentity`. Inline callback facades may omit this option and do not need to be memoized.

  See the [media adapter migration guide](https://canvastimeline.com/docs/media-adapter-migration) for complete examples.

- [#87](https://github.com/TechSquidTV/Canvas-Timeline/pull/87) [`46cfa6d`](https://github.com/TechSquidTV/Canvas-Timeline/commit/46cfa6dcd2bf9400e2aeb847b5e8ea5bdc2fc48d) Thanks [@KyleTryon](https://github.com/KyleTryon)! - Keep history, paused active clips, content bounds, and pan/zoom constraints reactive in focused React hooks. Edit commands now read selection at invocation without subscribing to document changes. Add atomic `TimelineEngine.setInOutRange()` and expose current selected clip IDs for command integrations.

  **BREAKING:** `useTimelineRangeSelection().setRange()` and `clearRange()` return `TimelineCommandResult`. Invalid or reversed ranges are rejected without mutation. In/Out controls without an explicit duration or `max` use current content bounds instead of an arbitrary 100-second limit. The fixed package group releases together.

- [#84](https://github.com/TechSquidTV/Canvas-Timeline/pull/84) [`706989f`](https://github.com/TechSquidTV/Canvas-Timeline/commit/706989fccae05c8b22cade17d24ceb584edfe737) Thanks [@KyleTryon](https://github.com/KyleTryon)! - Share unchanged track and clip snapshots across Core, history, and React. Track-row hooks share geometry and avoid unrelated collection subscriptions. Export `useTimelineSelector` for primitive and object selections with configurable equality, without subscribing to per-frame playback.

  **BREAKING:** React state and document-derived hook values are readonly. Use engine commands for edits instead of mutating returned snapshots. Core track commands, clip selection commands, and `updateClipProperties` now return `TimelineCommandResult` instead of void or booleans; check `result.ok`. React selection commands use the same contract. Missing selection IDs return `not-found` without changing the current selection, invalid track input returns `invalid-input`, and duplicate track/clip IDs are rejected. There are no compatibility aliases.

  Track commands validate current Core state, so consecutive commands in one handler work before React renders. Public examples use package imports and representative TSDoc examples compile against packed packages. Focused unit tests no longer generate API documentation.

- [#89](https://github.com/TechSquidTV/Canvas-Timeline/pull/89) [`210c46d`](https://github.com/TechSquidTV/Canvas-Timeline/commit/210c46d148aff9aa3ffeacc56a94b00e9242675f) Thanks [@KyleTryon](https://github.com/KyleTryon)! - Add undoable track rename, reorder, and collapse commands. Expose subscription-free `useTimelineTrackCommands`, and include the same operations in collection and row hooks. Add atomic `deleteClips` and `deleteSelectedClips` commands and use bulk selection deletion in the full editor. All commands validate current engine state. The fixed package suite releases together.

- [#83](https://github.com/TechSquidTV/Canvas-Timeline/pull/83) [`3ed9794`](https://github.com/TechSquidTV/Canvas-Timeline/commit/3ed97949998bcc06f58223d830b1408c4170e9d2) Thanks [@KyleTryon](https://github.com/KyleTryon)! - Unify editing around validated preview/commit transactions, including atomic clipboard batches. Commits re-evaluate current state, preserving intervening edits and current locks/policy. Pointer cancellation discards clip previews.

  **BREAKING:** replace direct engine clip mutators with `commitEdit`; use `engine.geometry`, `engine.media`, and `engine.keyframes` for their respective queries and operations. Engine read snapshots and rational times are readonly. React context carries only the engine; use `useTimelineEngine` for imperative access. Hook/geometry APIs no longer accept an unchecked track-kind generic. Command results now discriminate success payloads and failure reasons. RangeScrollbar exposes only axis-neutral thumb offset/size names. Query first content explicitly with `engine.media.getFirstContentTime`.

  Bound history by entries and serialized bytes, share unchanged history records, index active media intervals, isolate React state subscriptions, and coalesce worker updates without resending document content for viewport-only changes. Migrate package consumers and docs together.

  Active-media queries own their timing values and keep returned objects outside the membership cache. Clipboard batches preserve the rejecting edit’s reason and message.

### Patch Changes

- [#92](https://github.com/TechSquidTV/Canvas-Timeline/pull/92) [`91f1c26`](https://github.com/TechSquidTV/Canvas-Timeline/commit/91f1c26a251e6f613d1762f760283ee38f848173) Thanks [@KyleTryon](https://github.com/KyleTryon)! - Validate keyframe updates before changing document state, enforce roll-trim bounds, and return owned marker copies. Restore history with cleared edit previews and valid viewport bounds. Keep clip drag and trim previews owned by their initiating gesture, and refresh paused media when effective layer selections change.

- Updated dependencies [[`e26b3f6`](https://github.com/TechSquidTV/Canvas-Timeline/commit/e26b3f6f818a5f3ddbd8fe6b51c5dbff3003ae7b), [`3ed9794`](https://github.com/TechSquidTV/Canvas-Timeline/commit/3ed97949998bcc06f58223d830b1408c4170e9d2)]:
  - @techsquidtv/canvas-timeline-utils@0.2.0

## 0.1.0

### Minor Changes

- Publish the first public Canvas Timeline release.

  This initial release provides the framework-independent timeline engine,
  rational-time utilities, React hooks and accessible interaction primitives,
  canvas rendering, HTML media synchronization, Mediabunny media integration, and
  the batteries-included Canvas Timeline package.

  The `0.1.0` API includes grouped and policy-driven clip editing, undo and redo,
  selection and clipboard commands, snapping, markers, track locking, viewport and
  range controls, extensible scalar keyframes with Bezier interpolation, editorial
  ruler formats, worker-backed rendering, and frame-locked media playback.

  As the first public release, this version consolidates all previously unreleased
  changes. Earlier `0.0.1` package manifests were development placeholders and
  were never published.

### Patch Changes

- Updated dependencies []:
  - @techsquidtv/canvas-timeline-utils@0.1.0
