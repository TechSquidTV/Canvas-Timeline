# Public Release Checklist

> Warning: breaking changes are acceptable before the first public release. Do not add compatibility aliases, deprecated fallbacks, or duplicate API surfaces while tightening the package shape.

Use this as the final pre-public-release checklist for Canvas Timeline. The goal is to ship a small, coherent, well-tested open source library with observable docs, reliable publishing, and clear maintenance paths.

Last verified against repository contents on 2026-07-07.

## 0. Release Criteria

- [x] Define the exact first public version target.
  - [x] Publish the first public npm release as `0.0.1`.
  - [x] Document what API stability promise that version implies.
  - [x] Decide which packages are public on day one:
    - [x] `@techsquidtv/canvas-timeline`
    - [x] `@techsquidtv/canvas-timeline-core`
    - [x] `@techsquidtv/canvas-timeline-react`
    - [x] `@techsquidtv/canvas-timeline-renderer`
    - [x] `@techsquidtv/canvas-timeline-utils`
    - [x] `@techsquidtv/canvas-timeline-html-media-adapter`
    - [x] `@techsquidtv/canvas-timeline-mediabunny-adapter`
- [x] Define a release owner and fallback owner for npm, GitHub, docs, and incident response.
  - [x] Owner and fallback owner: TechSquidTV.
  - [x] Security contact: `security@techsquidtv.com`.
- [ ] Freeze feature scope before release hardening starts.
- [ ] Track all release-blocking work through issues or a project board.

## 1. API Shape And Package Boundaries

- [ ] Audit every exported symbol in each package.
  - [ ] Remove experimental exports that are not ready for public support.
  - [ ] Move exports to the lowest appropriate package boundary.
  - [ ] Avoid duplicated types, helpers, and naming patterns across packages.
  - [ ] Verify public names are consistent across core, React, renderer, adapters, and docs.
- [x] Decide whether all current subpath exports are intentional.
  - [ ] Main package: `.`, `./core`, `./react`, `./html-media`, `./renderer`, `./utils`, CSS entrypoints.
  - [ ] React package: `.`, `./hooks`, `./components`, `./range-scrollbar`, `./timecode-input`, `./timecode-field`, CSS entrypoints.
  - [ ] Core, renderer, utils, and adapters: ensure each subpath is supportable.
- [ ] Remove backwards-compatibility aliases and fallback exports before publishing.
- [x] Confirm the aggregate `@techsquidtv/canvas-timeline` package remains a thin composition layer.
- [x] Confirm framework-free code stays in `packages/core` and `packages/utils`.
- [ ] Confirm renderer and worker modules remain DOM-free except for main-thread theme resolution in `CanvasRenderer`.
- [ ] Confirm React package APIs do not leak app/demo-specific concerns.
- [x] Confirm adapter packages do not force optional media dependencies into the main package.
- [ ] Generate and review API docs from the actual package entrypoints.

## 2. TypeScript And Static Quality

- [ ] Enable the strictest practical TypeScript config for library packages.
  - [ ] Add or confirm `strict: true`.
  - [ ] Consider `exactOptionalPropertyTypes: true`.
  - [ ] Consider `noUncheckedIndexedAccess: true`.
  - [ ] Consider `noImplicitOverride: true`.
  - [ ] Keep `skipLibCheck` only if it is a deliberate toolchain tradeoff.
- [x] Keep `typescript/no-explicit-any` enforced.
- [ ] Review every public `unknown` use and keep only deliberate extensibility points, such as metadata or external callback payloads.
- [ ] Review all type assertions in production code.
  - [ ] Eliminate avoidable casts.
  - [ ] Replace unsafe casts with narrow helper functions where useful.
  - [ ] Keep test-only casts isolated to tests.
- [ ] Resolve or explicitly justify every lint ignore, `ts-expect-error`, and custom Knip ignore.
- [ ] Keep `knip` in CI and review ignored files before release.
- [ ] Keep duplicate exported types and helpers out of the package graph.
- [ ] Confirm all public APIs have useful TSDoc where generated docs depend on it.

## 3. Tests And Coverage

- [ ] Run the full local gate:
  - [ ] `vp install`
  - [ ] `vp run repo:check`
  - [ ] `vp test`
  - [ ] `vp run ci`
  - [ ] `vp run build`
  - [ ] `vp run package:check`
- [x] Keep package-level line coverage at or above the enforced threshold.
- [ ] Raise package-level coverage above the current minimum where risk is high.
  - [ ] Core command behavior, history, snapping, markers, hit testing, and playback.
  - [ ] Rational time and timecode parsing/formatting edge cases.
  - [ ] React hooks and interaction components.
  - [ ] Renderer theme resolution, drawing geometry, worker fallback, and custom layer paths.
  - [ ] HTML media and Mediabunny adapter failure modes.
- [ ] Add regression tests for every known bug fixed during release hardening.
- [ ] Add integration tests for the documented quick-start path using the public package entrypoint.
- [x] Add package-consumer smoke tests that install packed tarballs in a clean fixture.
- [x] Add SSR/build smoke tests for consumers that import only headless packages.
- [ ] Add browser-level checks for docs demos that cover desktop and mobile viewports.
- [ ] Add performance regression tests or benchmark thresholds for stress-test scenarios.

## 4. Rendering, Interaction, And Accessibility

- [ ] Verify 60fps-oriented architecture assumptions still hold.
  - [ ] Dense visuals stay on canvas.
  - [ ] React renders only low-density chrome and delegated active affordances.
  - [ ] No per-frame React state updates for playback, scrubbing, zooming, or scrolling.
  - [ ] CSS variable resolution happens only when theme inputs change.
- [ ] Validate pointer capture for drag, trim, range, playhead, and scrollbar interactions.
- [ ] Validate keyboard behavior for documented controls.
- [ ] Validate screen reader names, descriptions, roles, and invalid states.
- [ ] Validate hit targets across desktop, tablet, and mobile widths.
- [ ] Validate high contrast, reduced motion, and focus-visible behavior.
- [ ] Validate canvas text and geometry under different device pixel ratios.
- [ ] Confirm layout does not rely on demo-only CSS for package-owned mechanics.

## 5. Package Metadata And Publish Hygiene

- [x] Add a root `LICENSE` file.
- [x] Add `license` to every public package manifest.
- [x] Add `bugs`, `author` or maintainers, and `engines` to public package manifests.
- [x] Decide and document package `sideEffects`.
  - [x] Mark CSS-bearing packages carefully so CSS entrypoints are not tree-shaken incorrectly.
  - [x] Mark pure packages as side-effect free only after verifying entrypoints.
- [x] Confirm every public package has correct `homepage`, `repository.directory`, `keywords`, `files`, `exports`, `main`, and `types`.
- [x] Confirm all internal workspace dependencies publish as semver ranges through Changesets.
- [x] Confirm peer dependencies are intentional and not unnecessarily narrow.
  - [x] React peer range: `^19.2.7`.
  - [x] React DOM peer range: `^19.2.7`.
  - [x] Mediabunny peer range: `^1.50.3`.
- [x] Confirm optional peer behavior is explicit where applicable.
  - [x] No public package currently declares optional peer dependencies.
- [x] Confirm CSS files are copied into `dist` and exported by both `react` and aggregate packages.
- [x] Confirm source maps and declaration maps are intentionally included or intentionally omitted.
- [x] Run `vp run package:check` after a clean build.
- [x] Inspect packed tarballs for all public packages.
  - [x] `repo:package:check` runs `publint`, Are The Types Wrong, and the packed-tarball consumer smoke test.
- [x] Install packed tarballs into at least one clean Vite/React consumer app.

## 6. CI, Branch Protection, And Release Automation

- [x] Require these GitHub checks before merge:
  - [x] CI quality job.
  - [x] Security CodeQL job.
  - [x] Production dependency audit.
  - [x] Changeset status.
  - [x] Docs/build validation.
  - [x] Package validation.
- [x] Enforce branch protection on `main`.
  - [x] Require pull requests.
  - [x] Require up-to-date branches or merge queue.
  - [x] Require linear history if that is the desired release model.
  - [x] Block force pushes.
  - [x] Require signed commits or document why not.
    - [x] Signed commits are not required for the first public release; protected `main`, required checks, conventional commits, manual dispatch controls, and npm trusted publishing are the release gates.
- [x] Keep conventional commit checks for PR titles and commits.
- [ ] Confirm Dependabot PRs are grouped, reviewed, and covered by CI.
- [ ] Confirm CodeQL alerts are visible and assigned.
- [x] Confirm `pnpm audit --prod --audit-level high` is sufficient for release, or add a broader scheduled audit.
- [ ] Confirm npm trusted publishing is configured for every public package.
- [x] Confirm the release environment matches solo-maintainer constraints.
  - [x] Do not rely on GitHub environment approval flows.
  - [x] Keep manual dispatch controls, protected `main`, required CI checks, and npm trusted publishing as the release gates.
- [ ] Confirm Changesets can create release PRs and GitHub releases.
- [ ] Test a canary or snapshot release before the first public release.
- [ ] Confirm failed publish attempts are recoverable without manual package-version drift.
- [ ] Document the exact release runbook.

## 7. Security, Governance, And Community Files

- [x] Add `SECURITY.md`.
  - [x] Define where to report vulnerabilities.
  - [x] Define supported versions.
  - [x] Define expected response time.
- [x] Add `.github/CONTRIBUTING.md`.
  - [x] Include setup with Vite+.
  - [x] Include validation commands.
  - [x] Include package boundary rules.
  - [x] Include conventional commit expectations.
- [x] Add a `CODE_OF_CONDUCT.md`.
- [x] Add GitHub issue templates.
  - [x] Bug report.
  - [x] Feature request.
  - [x] Documentation issue.
  - [x] Performance issue.
- [x] Add a pull request template.
  - [x] Include tests run.
  - [x] Include package/API impact.
  - [x] Include docs/demo impact.
  - [x] Include breaking-change acknowledgement.
- [x] Add `SUPPORT.md` if support expectations differ from issue handling.
- [ ] Review repository visibility, npm organization access, and maintainer 2FA.
- [ ] Decide whether to require signed npm provenance on all public publishes.

## 8. Documentation And Examples

- [x] Verify the README quick start works from the published package, not workspace aliases.
  - [x] The consumer smoke test installs packed tarballs into a clean Vite/React fixture and builds the README quick-start import path.
- [x] Verify docs examples compile against public entrypoints.
  - [x] Source-backed demos and docs-site TypeScript paths compile in CI; larger examples should stay source-backed instead of prose-only.
- [x] Verify docs package pages match package manifests and exports.
  - [x] Package pages link to generated API reference from package entrypoints and use public package imports.
- [x] Verify API reference generation is reproducible in CI.
  - [x] CI runs `vp run ci`, `vp run build`, and `vp run package:check`; `repo:check` includes docs API generation and link verification.
- [x] Document package selection clearly:
  - [x] Aggregate package for React plus renderer.
  - [x] Core for headless engine usage.
  - [x] React for interaction primitives and hooks.
  - [x] Renderer for canvas drawing.
  - [x] Utils for rational time and math.
  - [x] Adapters for media sync.
- [x] Document styling imports and token ownership.
- [x] Document SSR/browser support and worker behavior.
- [ ] Document accessibility guarantees and integrator responsibilities.
- [x] Document performance model and app metadata separation.
- [x] Document migration policy for breaking changes.
- [x] Add troubleshooting docs for common install, bundler, CSS, peer dependency, and worker issues.
- [x] Add a changelog page or release notes path.

## 9. Docs Site And Operational Observability

- [x] Keep observability on the docs/demo infrastructure, not inside the open source library runtime.
- [x] Confirm Sentry client and server DSNs are configured only for the docs site.
- [ ] Reduce production trace sample rates if `1.0` is too noisy or costly.
- [ ] Add release identifiers to docs-site Sentry events.
- [ ] Add Sentry alerts for:
  - [ ] Docs build/deploy errors.
  - [ ] Client runtime error rate.
  - [ ] Server runtime error rate.
  - [ ] Demo hydration failures.
  - [ ] Media load failures.
  - [ ] Stress-demo performance regressions.
- [ ] Add uptime monitoring for `canvastimeline.com`.
- [ ] Add synthetic checks for:
  - [ ] Home page.
  - [ ] Getting started.
  - [ ] Package docs.
  - [ ] Live demos.
  - [ ] API reference pages.
- [ ] Add analytics or privacy-preserving traffic metrics if needed.
- [ ] Add dashboards for docs traffic, errors, demo usage, and performance samples.
- [x] Confirm no library package sends telemetry, metrics, network calls, or Sentry events by default.

## 10. Performance And Bundle Quality

- [ ] Establish bundle-size baselines per package.
- [ ] Add bundle-size or package-size checks for release PRs.
- [ ] Verify tree-shaking of focused package imports.
- [ ] Verify aggregate package imports do not pull optional adapters unless intentionally exported.
- [ ] Verify CSS bundle size and entrypoint split.
- [ ] Verify worker bundle behavior in common bundlers.
- [ ] Benchmark large timelines with many tracks, clips, markers, and zoom states.
- [ ] Benchmark playback, scrubbing, dragging, trimming, scrolling, and theme switching.
- [ ] Document known performance limits.
- [ ] Keep heavy app metadata out of `TimelineState` examples.

## 11. Compatibility Matrix

- [x] Decide supported Node versions.
  - [x] Public packages require Node `>=24`.
- [x] Decide supported package managers.
  - [x] Development uses `pnpm@11.2.2` through Vite+.
- [x] Decide supported React versions.
  - [x] Public React-facing packages require React `^19.2.7`; React DOM integrations require React DOM `^19.2.7`.
- [x] Decide supported browsers.
  - [x] Current browser target is latest stable Chromium, Firefox, and Safari with modern Pointer Events, CSS custom properties, ResizeObserver, and canvas support.
- [ ] Validate Chromium, Firefox, and Safari.
- [ ] Validate macOS, Windows, and Linux development installs if officially supported.
- [x] Validate Vite consumer apps.
- [ ] Validate Next.js or Remix only if documented as supported.
- [ ] Validate SSR-safe imports for headless and React packages.
- [x] Validate no DOM access occurs during server import of headless packages.

## 12. Final Release Drill

- [ ] Start from a clean clone.
- [ ] Run `vp install`.
- [ ] Run `vp run ci`.
- [ ] Run `vp run build`.
- [ ] Run `vp run package:check`.
- [ ] Run docs build.
- [ ] Run canary/snapshot publish.
- [ ] Install the canary in a clean consumer project.
- [ ] Smoke test the docs site against the canary package behavior.
- [ ] Confirm Sentry and uptime checks capture docs/demo failures.
- [ ] Merge the final Changesets release PR.
- [ ] Publish the stable release through trusted publishing.
- [ ] Verify npm package pages, GitHub releases, changelog, and docs links.
- [ ] Create a post-release issue for any non-blocking follow-up work.

## Current Repo-Specific Gaps Observed

- [x] GitHub governance files are complete: `SECURITY.md`, `CODE_OF_CONDUCT.md`, support policy, issue templates, and PR template.
- [x] Public package manifests advertise `bugs`, `author`, `engines`, and `sideEffects`.
- [ ] Library packages inherit a base TypeScript config that does not currently declare `strict: true`.
- [x] CI exists and is broad; branch protection and required-check settings are configured externally for the solo-maintainer workflow.
- [x] Package validation exists through `publint`, packed tarballs, Are The Types Wrong, and a clean Vite/React consumer smoke test.
- [x] Docs/demo observability exists through Sentry metrics, but alerting, release identifiers, uptime checks, and synthetic checks still need to be confirmed.
- [x] Coverage gates exist, including package-level line coverage, but riskier public APIs should be reviewed for behavior-driven test coverage beyond the minimum.

## Final Shape Check

- [ ] The public API is smaller than the internal implementation.
- [ ] Every public export has one clear home.
- [x] Every package has one clear responsibility.
- [x] CI enforces quality instead of relying on manual discipline.
- [x] Release automation can be tested with canary packages before stable publish.
- [ ] Observability watches docs, demos, CI, publish, and uptime, not user applications.
- [x] Documentation examples compile against published entrypoints.
- [ ] No compatibility aliases or fallback APIs remain from pre-release churn.
