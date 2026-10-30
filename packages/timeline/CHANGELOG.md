# @techsquidtv/canvas-timeline

## 0.6.0

### Minor Changes

- [#189](https://github.com/TechSquidTV/Canvas-Timeline/pull/189) [`2c3cd6f`](https://github.com/TechSquidTV/Canvas-Timeline/commit/2c3cd6f9b0cc414b8cabe6a752f1433ed32405d4) Thanks [@renovate](https://github.com/apps/renovate)! - **BREAKING:** Require Node.js 24.15.0 or newer for the repository and all public packages. Upgrade older Node.js installations before installing or building Canvas Timeline.

### Patch Changes

- Updated dependencies [[`97907cb`](https://github.com/TechSquidTV/Canvas-Timeline/commit/97907cb4ce2547b10b3894f4646b80ad6fd88d8d), [`62983c5`](https://github.com/TechSquidTV/Canvas-Timeline/commit/62983c52ac6506f4cb5e2803031327f2c72f2592), [`434e765`](https://github.com/TechSquidTV/Canvas-Timeline/commit/434e765b7544fc5c70431a687188c0b8d4a52b81), [`c2df09f`](https://github.com/TechSquidTV/Canvas-Timeline/commit/c2df09f528d6ea00ab35d41621a0835e57418a16), [`90ab8ef`](https://github.com/TechSquidTV/Canvas-Timeline/commit/90ab8ef65fcbb772b865a985a505664bb6360192), [`293fc1d`](https://github.com/TechSquidTV/Canvas-Timeline/commit/293fc1d6c30082b245884216f96ed2d5db1b2151), [`083949c`](https://github.com/TechSquidTV/Canvas-Timeline/commit/083949c2223c42c4bf66700562a84b765bdc4f32), [`90e3b56`](https://github.com/TechSquidTV/Canvas-Timeline/commit/90e3b569e8543da2f67ced607710a8e7825d6347), [`f5b6fa4`](https://github.com/TechSquidTV/Canvas-Timeline/commit/f5b6fa4e199b01db8984f850bd54cfbc592958da), [`2c3cd6f`](https://github.com/TechSquidTV/Canvas-Timeline/commit/2c3cd6f9b0cc414b8cabe6a752f1433ed32405d4)]:
  - @techsquidtv/canvas-timeline-react@0.6.0
  - @techsquidtv/canvas-timeline-core@0.6.0
  - @techsquidtv/canvas-timeline-html-media-adapter@0.6.0
  - @techsquidtv/canvas-timeline-renderer@0.6.0
  - @techsquidtv/canvas-timeline-utils@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [[`36469c3`](https://github.com/TechSquidTV/Canvas-Timeline/commit/36469c333f9aa33e1f7d1f4f33ae4295f26f4f8f), [`646e5d7`](https://github.com/TechSquidTV/Canvas-Timeline/commit/646e5d70b5308a8de802d06ebe4b8851206d46c3), [`4df36d6`](https://github.com/TechSquidTV/Canvas-Timeline/commit/4df36d6a8849f845fa07e395b6ec7c03853051e6), [`f1e58f4`](https://github.com/TechSquidTV/Canvas-Timeline/commit/f1e58f496b86db6ee7ddb192de500bb3f329752a), [`7e287d3`](https://github.com/TechSquidTV/Canvas-Timeline/commit/7e287d3aa5182e0e1fb512c55a33344d4a01dd66), [`e083792`](https://github.com/TechSquidTV/Canvas-Timeline/commit/e083792cb045f89272b23d15465f42cb1cbe377e), [`a7dc9ac`](https://github.com/TechSquidTV/Canvas-Timeline/commit/a7dc9ac139e385e45f202022695a645a35a487f9)]:
  - @techsquidtv/canvas-timeline-react@0.5.0
  - @techsquidtv/canvas-timeline-html-media-adapter@0.5.0
  - @techsquidtv/canvas-timeline-renderer@0.5.0
  - @techsquidtv/canvas-timeline-core@0.5.0
  - @techsquidtv/canvas-timeline-utils@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @techsquidtv/canvas-timeline-utils@0.4.0
  - @techsquidtv/canvas-timeline-core@0.4.0
  - @techsquidtv/canvas-timeline-react@0.4.0
  - @techsquidtv/canvas-timeline-renderer@0.4.0
  - @techsquidtv/canvas-timeline-html-media-adapter@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [[`473ada4`](https://github.com/TechSquidTV/Canvas-Timeline/commit/473ada4bbc520ed135336aa7aee3620dc332f930)]:
  - @techsquidtv/canvas-timeline-core@0.3.0
  - @techsquidtv/canvas-timeline-react@0.3.0
  - @techsquidtv/canvas-timeline-renderer@0.3.0
  - @techsquidtv/canvas-timeline-html-media-adapter@0.3.0
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

- [#60](https://github.com/TechSquidTV/Canvas-Timeline/pull/60) [`ceb3dd4`](https://github.com/TechSquidTV/Canvas-Timeline/commit/ceb3dd494a3c3cadc102630803f810dfe3e75b05) Thanks [@KyleTryon](https://github.com/KyleTryon)! - **BREAKING:** Redesign HTML media sources, React integration, recovery, and runtime controls around one app-resolved source per logical timeline asset.

  Migrate the former source record to `[{ sourceId, input, fallbacks?, timing? }]`, and replace `HTMLMediaAdapterSource` with `HTMLMediaSourceInput`. The adapter no longer treats duplicate IDs as fallback variants or owns original/proxy selection; applications should select the desired original, proxy, preview, or export representation and reserve `fallbacks` for equivalent transport or cache alternatives.

  React hooks now come from `@techsquidtv/canvas-timeline-html-media-adapter/react` and are no longer re-exported from the aggregate package's `./html-media` subpath. Attach the callback `mediaRef` returned by the hook instead of passing a caller-owned object ref. Use immutable `sourceStateById` snapshots for loading and attempt diagnostics, and use `retrySource()` or `replaceSource()` for explicit recovery and representation changes. Runtime volume and mute controls no longer require adapter recreation.

  See the [media adapter migration guide](https://canvastimeline.com/docs/media-adapter-migration) for complete examples.

- [#83](https://github.com/TechSquidTV/Canvas-Timeline/pull/83) [`3ed9794`](https://github.com/TechSquidTV/Canvas-Timeline/commit/3ed97949998bcc06f58223d830b1408c4170e9d2) Thanks [@KyleTryon](https://github.com/KyleTryon)! - Unify editing around validated preview/commit transactions, including atomic clipboard batches. Commits re-evaluate current state, preserving intervening edits and current locks/policy. Pointer cancellation discards clip previews.

  **BREAKING:** replace direct engine clip mutators with `commitEdit`; use `engine.geometry`, `engine.media`, and `engine.keyframes` for their respective queries and operations. Engine read snapshots and rational times are readonly. React context carries only the engine; use `useTimelineEngine` for imperative access. Hook/geometry APIs no longer accept an unchecked track-kind generic. Command results now discriminate success payloads and failure reasons. RangeScrollbar exposes only axis-neutral thumb offset/size names. Query first content explicitly with `engine.media.getFirstContentTime`.

  Bound history by entries and serialized bytes, share unchanged history records, index active media intervals, isolate React state subscriptions, and coalesce worker updates without resending document content for viewport-only changes. Migrate package consumers and docs together.

  Active-media queries own their timing values and keep returned objects outside the membership cache. Clipboard batches preserve the rejecting edit’s reason and message.

### Patch Changes

- Updated dependencies [[`e26b3f6`](https://github.com/TechSquidTV/Canvas-Timeline/commit/e26b3f6f818a5f3ddbd8fe6b51c5dbff3003ae7b), [`ceb3dd4`](https://github.com/TechSquidTV/Canvas-Timeline/commit/ceb3dd494a3c3cadc102630803f810dfe3e75b05), [`a961752`](https://github.com/TechSquidTV/Canvas-Timeline/commit/a9617526544f823d787dc23f2e025d52d8c49f40), [`ceb3dd4`](https://github.com/TechSquidTV/Canvas-Timeline/commit/ceb3dd494a3c3cadc102630803f810dfe3e75b05), [`94bd617`](https://github.com/TechSquidTV/Canvas-Timeline/commit/94bd61774e8f508a584277622899ee6ded2de709), [`46cfa6d`](https://github.com/TechSquidTV/Canvas-Timeline/commit/46cfa6dcd2bf9400e2aeb847b5e8ea5bdc2fc48d), [`91f1c26`](https://github.com/TechSquidTV/Canvas-Timeline/commit/91f1c26a251e6f613d1762f760283ee38f848173), [`706989f`](https://github.com/TechSquidTV/Canvas-Timeline/commit/706989fccae05c8b22cade17d24ceb584edfe737), [`210c46d`](https://github.com/TechSquidTV/Canvas-Timeline/commit/210c46d148aff9aa3ffeacc56a94b00e9242675f), [`3ed9794`](https://github.com/TechSquidTV/Canvas-Timeline/commit/3ed97949998bcc06f58223d830b1408c4170e9d2)]:
  - @techsquidtv/canvas-timeline-utils@0.2.0
  - @techsquidtv/canvas-timeline-core@0.2.0
  - @techsquidtv/canvas-timeline-react@0.2.0
  - @techsquidtv/canvas-timeline-renderer@0.2.0
  - @techsquidtv/canvas-timeline-html-media-adapter@0.2.0

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
  - @techsquidtv/canvas-timeline-html-media-adapter@0.1.0
  - @techsquidtv/canvas-timeline-react@0.1.0
  - @techsquidtv/canvas-timeline-renderer@0.1.0
  - @techsquidtv/canvas-timeline-utils@0.1.0
