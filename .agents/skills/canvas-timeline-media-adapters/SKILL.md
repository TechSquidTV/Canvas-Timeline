---
name: canvas-timeline-media-adapters
description: Design, implement, review, or test Canvas Timeline media synchronization across Core, React hooks, the HTML media adapter, and the Mediabunny adapter. Use for source descriptors, original/proxy policy, equivalent fallbacks, timestamp mapping, external clocks, playback ranges, adapter lifecycle, recovery, track selection, decoded frames, Web Audio, media demos, and migration documentation.
---

# Canvas Timeline Media Adapters

## Core Rule

Keep editorial representation policy in the application and media mechanics in
the adapters. The app chooses an original, editing proxy, review encode, or
export source. Give the adapter one resolved choice per stable `sourceId`, with
optional `fallbacks` only for content-equivalent ways to load that choice.

Do not add duplicate-ID conventions, adapter-owned proxy selection, variants,
compatibility aliases, or fallback APIs for removed shapes.

## Inspect Before Editing

- Read the canonical [media adapter guide](file:///Users/techsquidtv/Documents/Git/canvas-timeline/apps/www/src/content/docs/media-adapters.mdx) and, for breaking work, the [migration guide](file:///Users/techsquidtv/Documents/Git/canvas-timeline/apps/www/src/content/docs/media-adapter-migration.mdx).
- Inspect shared contracts in [core/media.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/core/src/media.ts) and external range handling in [core/playback.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/core/src/playback.ts).
- Inspect transport orchestration in [useTimelineMediaSync.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/react/src/hooks/playback/useTimelineMediaSync.ts) and [useTimelineMediaPlayback.ts](file:///Users/techsquidtv/Documents/Git/canvas-timeline/packages/react/src/hooks/playback/useTimelineMediaPlayback.ts).
- Inspect both the imperative and React entrypoints for the adapter being changed.
- Use [manage-live-demos](file:///Users/techsquidtv/Documents/Git/canvas-timeline/.agents/skills/manage-live-demos/SKILL.md) as well when changing media demos or their registries.

## Package Boundaries

- **Application**: Own the media library, asset relationships, proxy/original
  selection, relinking, preview/export policy, and persistence.
- **Core**: Own framework-neutral synchronization, source timing, lifecycle,
  operation, error, and external playback-range contracts. Keep Core free of
  React, DOM, Web Audio, and Mediabunny types.
- **React**: Own active-layer selection, asynchronous transport coordination,
  cancellation, adapter replacement, and committed resource lifecycles. Keep
  the hooks headless and renderer-independent.
- **HTML adapter**: Map active clips to one caller-supplied
  `HTMLMediaElement`. Keep the package root imperative and publish React helpers
  only from `./react`.
- **Mediabunny adapter**: Own input opening, track selection, decoded canvas
  frames, audio scheduling, metadata, and lazy source controllers. Keep the
  package root imperative and publish React helpers only from `./react`.
- **Renderer**: Draw timeline visuals. Do not push preview decoding, media
  clocks, or source loading into the canvas renderer.

## Source And Lifecycle Invariants

- Accept the concise common case `{ sourceId, input }`.
- Require unique, non-empty `sourceId` values matching timeline clips.
- Treat `[input, ...fallbacks]` as ordered equivalent load attempts. Preserve
  individual attempts and the selected input index in observable state.
- Use `replaceSource()` for representation changes and relinks. Use
  `retrySource()` for a fresh attempt of the current definition.
- Use a `TimelineMediaSourceTiming` anchor when logical source time and resolved
  media time differ. Map both seeks and reported source metadata consistently.
- Replace `sourceStateById` with a referentially new immutable snapshot whenever
  observable state changes. Commit related definition, readiness, status, and
  metadata changes before notifying subscribers.
- Make disposal idempotent. Release only adapter-owned inputs, object URLs,
  contexts, nodes, timers, iterators, listeners, and clocks.
- Keep ordinary source reconciliation semantic so equivalent inline arrays do
  not recreate adapters or reload media. Treat factories, selectors, supplied
  inputs, and custom option objects as identity-bearing policy.

## Transport And React Invariants

- Let Core enforce the same In/Out, duration, target, and loop policy for
  internal and external clocks.
- Keep browser activation non-blocking through `requestClockActivation()`.
  Report audio degradation separately from visual transport failure.
- Serialize play, tick, loop, seek, and rate synchronization. Prevent stale
  asynchronous work from taking ownership after pause or adapter replacement.
- Share concurrent startup requests. Resolve an intentionally cancelled startup
  as `reason: 'cancelled'` without calling the error handler.
- Treat loop realignment as one awaited barrier. Do not schedule repeated loop
  restarts while the external clock still reports the old out-of-range time.
- Pass `adapterIdentity` when a replaced controller must cancel pending work and
  release its clock. Omit it for an inline callback facade whose identity is not
  its resource lifetime.
- Create and dispose browser resources in committed effects, not during render.
  High-level hooks should own callback refs; low-level hooks may accept resolved
  elements for custom composition.
- Keep per-frame state out of broad React results. Expose focused subscriptions
  for consumers that intentionally need decoded frame timestamps.

## Adapter-Specific Checks

### HTML Media

- Support native URL, `Blob`, and `File` inputs without leaking object URLs.
- Coordinate startup failure with native `error` and `play()` rejection in
  either event order so an equivalent fallback can continue the same play.
- Preserve the element and adapter across ordinary registry updates.

### Mediabunny

- Load sources only when active or explicitly preloaded; allow them to be
  unloaded without losing the transport clock.
- Use explicit track selectors when primary tracks are insufficient. Keep HLS
  formats and `UrlSource` options on the input descriptor rather than guessing
  them for every URL.
- Expose selected-track timing, dimensions, rotation, frame rate, and audio
  metadata through source state.
- Create or resume an audio graph only when a decodable audio track is selected.
  Never close a caller-supplied `AudioContext` or dispose a caller-supplied
  Mediabunny input.
- Apply runtime volume and mute changes without reloading sources.

## Review Checklist

- Verify the simple source case stayed small and advanced policy remained
  optional.
- Verify proxy/original choice did not leak into the adapter contract.
- Verify custom headless hooks and the packaged high-level hooks can both use
  the result without private engine access.
- Test source fallback, retry, replacement, timestamp origins, adapter
  replacement, pending-play cancellation, loop barriers, StrictMode lifecycle,
  video-only media, external audio ownership, and immutable notifications as
  applicable.
- Update TSDoc, package READMEs, canonical docs, migration notes, source-backed
  demos, the full editor, and a Changeset when their public shapes are affected.

## Validation

Run focused suites first:

```bash
vp test packages/core/src/engine.test.ts
vp test packages/react/src/hooks/integration/media.test.tsx
vp test packages/html-media-adapter/src/index.test.ts
vp test packages/mediabunny-adapter/src/index.test.ts packages/mediabunny-adapter/src/react.test.tsx
```

Then validate the affected public surface:

```bash
vp run repo:typecheck
vp run repo:check
vp run build:packages
```

When docs demos change, run the demo verifier and docs build from
`manage-live-demos`. Use `vp run ci` and `vp run repo:package:check` for final
confidence on a broad or release-facing media change.
