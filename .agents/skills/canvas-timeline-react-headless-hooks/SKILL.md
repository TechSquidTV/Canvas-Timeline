---
name: canvas-timeline-react-headless-hooks
description: Use when adding, reviewing, or refactoring Canvas Timeline React hooks, headless hook APIs, hook naming, playhead/scrubber behavior, interaction chrome, live engine subscriptions, command result shapes, TSDoc, docs, or tests under packages/react/src/hooks and related React components.
---

# Canvas Timeline React Headless Hooks

## Core Rule

Design React hooks as headless, composable API surfaces first. Package DOM
components and docs demos should consume those hooks or the same engine behavior
without making the hook depend on visual implementation details.

Before editing hook APIs, inspect:

- [React hooks](../../../packages/react/src/hooks)
- [React component chrome](../../../packages/react/src/components)
- [Provider](../../../packages/react/src/Provider.tsx)
- [System architecture docs](../../../apps/www/src/content/docs/architecture.mdx)
- [React editor hooks docs](../../../apps/www/src/content/docs/react-hooks.mdx)

For `useTimelineMediaSync`, `useTimelineMediaPlayback`, or adapter React hooks,
also use [canvas-timeline-media-adapters](../canvas-timeline-media-adapters/SKILL.md).

## Hook Shape

Prefer narrow hooks whose subscription cost matches what the caller asks for:

- **Command/state hooks** expose ordinary app chrome state and imperative
  commands. They must not subscribe to live per-frame playhead/render events
  unless the hook name and docs make that cost explicit.
- **Live value hooks** expose high-frequency engine state through
  `useSyncExternalStore` or refs. Use these for playhead readouts, active media,
  marker proximity, live edit impacts, and other UI that genuinely needs live
  cursor or interaction state.
- **Control adapter hooks** return headless props, formatted values, and
  imperative setters for Base UI, range scrollbars, timecode fields, or custom
  semantic controls.
- **Imperative DOM hooks** may update refs/styles directly for low-count
  affordances such as playheads and grabbers. Do not map scrub/playback ticks to
  React state.

Keep public hook result objects complete enough for app code to build custom UI:
state, derived labels/text, ids, geometry/source-mapping helpers where useful,
capability booleans, and command functions. Avoid requiring consumers to inspect
private engine state to finish a normal control.

## Naming Conventions

Use consistent public names. No compatibility aliases, duplicate names for the
same behavior, or fallback APIs.

### Hook Functions

- `useTimeline<Domain>()` for canonical timeline domains:
  `useTimelinePlayback`, `useTimelineTracks`, `useTimelineClipboard`.
- `useTimeline<Thing>Time()` for live `RationalTime` subscriptions:
  `useTimelinePlayheadTime`.
- `useTimeline<Thing>Control()` for scalar/range/accessibility adapters:
  `useTimelinePlayheadControl`, `useTimelineZoomControl`.
- `useTimeline<Thing>RangeControl()` for range-valued adapters:
  `useTimelineViewportRangeControl`.
- `useActive<Domain>()` only for focused live queries derived from the current
  playhead or media state: `useActiveClips`, `useActiveMedia`.
- `use<Primitive>()` without `Timeline` only for package primitives that are not
  timeline-domain state, such as `usePlaybackEffect`.

### Types

- Result interfaces for canonical hooks: `UseTimeline<Domain>Result`.
- Options interfaces for internal primitive hooks:
  `UseTimeline<Primitive>Options`.
- Options interfaces for public control adapters:
  `Timeline<Thing>ControlOptions` or `Timeline<Thing>RangeControlOptions`.
- Public reusable models should be named for the domain, not the hook:
  `TimelineClipEntry`, `TimelineCommandResult`.

### Fields And Commands

- `RationalTime` fields end in `Time`: `playheadTime`, `visibleStartTime`.
- Numeric seconds fields end in `Seconds`: `playheadSeconds`,
  `visibleDurationSeconds`.
- Pixel fields end in `Left`, `Width`, `X`, or `Pixels` according to existing
  package usage: `scrollLeft`, `viewportWidth`.
- Capability booleans use `can*`: `canUndo`, `canPaste`.
- Presence booleans use `has*`: `hasSelection`, `hasInOutRange`.
- State booleans should read naturally with existing package style:
  `playing`, `snapEnabled`, `selected`.
- Commands are imperative verbs: `set*`, `clear*`, `toggle*`, `seekTo*`,
  `step*`, `move*`, `trim*`, `split*`, `delete*`.
- Ordinary commands that can fail return `TimelineCommandResult`; include a
  machine-readable failure reason instead of requiring consumers to infer state.
- Media-aware `play()` returns `Promise<TimelineMediaPlayResult>` so adapter
  failures can include a stable reason, message, and cause. Media commands that
  await synchronization must not report success before synchronization settles.
- Base UI-style callbacks use `onValueChange` and `onValueCommitted`.

## Media Hook Guardrails

- Prefer `useTimelineMediaSync()` for complete media-aware transport. Use
  `useTimelineMediaPlayback()` directly only when implementing a lower-level
  external-clock integration.
- Deliver runtime failures to `onError` as `TimelineMediaError`. Treat an
  intentional pending-play cancellation as a non-error result with
  `reason: 'cancelled'`.
- Share concurrent play startup, serialize adapter synchronization, and use
  generations or equivalent ownership checks so stale promises cannot restart a
  paused or replaced clock.
- Pass `adapterIdentity` when the underlying resource changes. Do not require it
  for inline callback facades that are recreated during render.
- Create adapters and attach browser listeners in committed effects. Dispose the
  exact created instance during cleanup, including StrictMode replay and element
  replacement.
- Keep source lifecycle snapshots immutable and current on every hook render.
  Do not hide referentially new adapter state behind stale memo dependencies.
- Keep browser audio activation non-blocking and separate degraded audio status
  from visual transport success.

## Time And Units

Use `RationalTime` for timeline model inputs and engine commands. Convert to
decimal seconds only at UI/control edges, and make numeric fields explicit with
`Seconds` in the name.

Allowed numeric UI-edge examples:

- Slider values and steps: `value`, `step`, `amountSeconds`.
- Formatted display values: `playheadSeconds`, `visibleEndSeconds`.
- Pixel geometry: `scrollLeft`, `viewportWidth`, `zoomScale`.

## Performance Guardrails

- Do not put per-frame playhead/render events into provider state.
- Do not put drag-time edit consequences such as active edit impacts into
  provider state; expose them through a focused live hook backed by an engine
  event and `useSyncExternalStore`.
- Use `useSyncExternalStore` for live engine subscriptions that should trigger
  React renders.
- Use refs/direct style transforms for low-count visual affordances that move
  during scrub, scroll, zoom, or playback.
- Keep event name arrays, class maps, and drag callbacks stable when they affect
  subscription hooks.
- Use pointer capture for drag/trim/scrub interactions.
- Avoid layout reads inside pointer-move loops. Capture bounds on pointer down
  unless the interaction genuinely supports live layout changes mid-drag.
- Do not attach window-level drag listeners when pointer-captured target
  listeners are enough.

## API Review Checklist

Before finishing hook changes, check:

- Does each hook name reveal whether it is broad state, live state, a control
  adapter, or a primitive?
- Can product code build custom UI without touching private engine internals?
- Are live subscriptions isolated from ordinary toolbar/menu hooks?
- Are dynamic bounds derived from reactive state rather than stable engine
  object identity?
- Are options and result fields fully documented with TSDoc?
- Did docs tell users which hook to compose for readouts versus commands?
- Did examples avoid broad hooks when a narrower hook is cheaper?
- Did tests cover API shape, command results, dynamic bounds, render churn, and
  mouse/touch interaction paths where relevant?
- For media hooks, did tests cover pending-start cancellation, concurrent play,
  adapter replacement, loop realignment, structured errors, and StrictMode
  resource cleanup?

## Validation

Run focused tests for the changed hook/component, then run the repo checks:

```bash
vp test packages/react/src/hooks.test.ts packages/react/src/hooks/accessibilityControls.test.tsx
vp test packages/react/src/components/playhead/tapBehavior.test.tsx
vp run repo:check
```

When docs demos or registry snippets change, also run:

```bash
vp run --filter @techsquidtv/canvas-timeline-www docs:demos
vp run docs:api
```
