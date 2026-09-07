# @techsquidtv/canvas-timeline-renderer

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

- [#83](https://github.com/TechSquidTV/Canvas-Timeline/pull/83) [`3ed9794`](https://github.com/TechSquidTV/Canvas-Timeline/commit/3ed97949998bcc06f58223d830b1408c4170e9d2) Thanks [@KyleTryon](https://github.com/KyleTryon)! - Unify editing around validated preview/commit transactions, including atomic clipboard batches. Commits re-evaluate current state, preserving intervening edits and current locks/policy. Pointer cancellation discards clip previews.

  **BREAKING:** replace direct engine clip mutators with `commitEdit`; use `engine.geometry`, `engine.media`, and `engine.keyframes` for their respective queries and operations. Engine read snapshots and rational times are readonly. React context carries only the engine; use `useTimelineEngine` for imperative access. Hook/geometry APIs no longer accept an unchecked track-kind generic. Command results now discriminate success payloads and failure reasons. RangeScrollbar exposes only axis-neutral thumb offset/size names. Query first content explicitly with `engine.media.getFirstContentTime`.

  Bound history by entries and serialized bytes, share unchanged history records, index active media intervals, isolate React state subscriptions, and coalesce worker updates without resending document content for viewport-only changes. Migrate package consumers and docs together.

  Active-media queries own their timing values and keep returned objects outside the membership cache. Clipboard batches preserve the rejecting edit’s reason and message.

### Patch Changes

- Updated dependencies [[`e26b3f6`](https://github.com/TechSquidTV/Canvas-Timeline/commit/e26b3f6f818a5f3ddbd8fe6b51c5dbff3003ae7b), [`ceb3dd4`](https://github.com/TechSquidTV/Canvas-Timeline/commit/ceb3dd494a3c3cadc102630803f810dfe3e75b05), [`a961752`](https://github.com/TechSquidTV/Canvas-Timeline/commit/a9617526544f823d787dc23f2e025d52d8c49f40), [`94bd617`](https://github.com/TechSquidTV/Canvas-Timeline/commit/94bd61774e8f508a584277622899ee6ded2de709), [`46cfa6d`](https://github.com/TechSquidTV/Canvas-Timeline/commit/46cfa6dcd2bf9400e2aeb847b5e8ea5bdc2fc48d), [`91f1c26`](https://github.com/TechSquidTV/Canvas-Timeline/commit/91f1c26a251e6f613d1762f760283ee38f848173), [`706989f`](https://github.com/TechSquidTV/Canvas-Timeline/commit/706989fccae05c8b22cade17d24ceb584edfe737), [`210c46d`](https://github.com/TechSquidTV/Canvas-Timeline/commit/210c46d148aff9aa3ffeacc56a94b00e9242675f), [`3ed9794`](https://github.com/TechSquidTV/Canvas-Timeline/commit/3ed97949998bcc06f58223d830b1408c4170e9d2)]:
  - @techsquidtv/canvas-timeline-utils@0.2.0
  - @techsquidtv/canvas-timeline-core@0.2.0
  - @techsquidtv/canvas-timeline-react@0.2.0

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
  - @techsquidtv/canvas-timeline-core@0.1.0
  - @techsquidtv/canvas-timeline-react@0.1.0
  - @techsquidtv/canvas-timeline-utils@0.1.0
