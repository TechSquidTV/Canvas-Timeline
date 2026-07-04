# Public Release Checklist

> Warning: breaking changes are acceptable before the first public release. Do not add compatibility aliases, deprecated fallbacks, or duplicate API surfaces while tightening the package shape.

Use this as the final pre-public-release checklist for Canvas Timeline. The goal is to ship a small, coherent, well-tested open source library with observable docs, reliable publishing, and clear maintenance paths.

## 0. Release Criteria

- [ ] Define the exact first public version target.
  - [ ] Publish the first public npm release as `0.0.1`.
  - [ ] Document what API stability promise that version implies.
  - [ ] Decide which packages are public on day one:
    - [ ] `@techsquidtv/canvas-timeline`
    - [ ] `@techsquidtv/canvas-timeline-core`
    - [ ] `@techsquidtv/canvas-timeline-react`
    - [ ] `@techsquidtv/canvas-timeline-renderer`
    - [ ] `@techsquidtv/canvas-timeline-utils`
    - [ ] `@techsquidtv/canvas-timeline-html-media-adapter`
    - [ ] `@techsquidtv/canvas-timeline-mediabunny-adapter`
- [ ] Define a release owner and fallback owner for npm, GitHub, docs, and incident response.
- [ ] Freeze feature scope before release hardening starts.
- [ ] Track all release-blocking work through issues or a project board.

## 1. API Shape And Package Boundaries

- [ ] Audit every exported symbol in each package.
  - [ ] Remove experimental exports that are not ready for public support.
  - [ ] Move exports to the lowest appropriate package boundary.
  - [ ] Avoid duplicated types, helpers, and naming patterns across packages.
  - [ ] Verify public names are consistent across core, React, renderer, adapters, and docs.
- [ ] Decide whether all current subpath exports are intentional.
  - [ ] Main package: `.`, `./core`, `./react`, `./html-media`, `./renderer`, `./utils`, CSS entrypoints.
  - [ ] React package: `.`, `./hooks`, `./components`, `./range-scrollbar`, `./timecode-input`, `./timecode-field`, CSS entrypoints.
  - [ ] Core, renderer, utils, and adapters: ensure each subpath is supportable.
- [ ] Remove backwards-compatibility aliases and fallback exports before publishing.
- [ ] Confirm the aggregate `@techsquidtv/canvas-timeline` package remains a thin composition layer.
- [ ] Confirm framework-free code stays in `packages/core` and `packages/utils`.
- [ ] Confirm renderer and worker modules remain DOM-free except for main-thread theme resolution in `CanvasRenderer`.
- [ ] Confirm React package APIs do not leak app/demo-specific concerns.
- [ ] Confirm adapter packages do not force optional media dependencies into the main package.
- [ ] Generate and review API docs from the actual package entrypoints.

## 2. TypeScript And Static Quality

- [ ] Enable the strictest practical TypeScript config for library packages.
  - [ ] Add or confirm `strict: true`.
  - [ ] Consider `exactOptionalPropertyTypes: true`.
  - [ ] Consider `noUncheckedIndexedAccess: true`.
  - [ ] Consider `noImplicitOverride: true`.
  - [ ] Keep `skipLibCheck` only if it is a deliberate toolchain tradeoff.
- [ ] Keep `typescript/no-explicit-any` enforced.
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
  - [ ] `vp check`
  - [ ] `vp test`
  - [ ] `vp run ci`
  - [ ] `vp run build`
  - [ ] `vp run package:check`
- [ ] Keep package-level line coverage at or above the enforced threshold.
- [ ] Raise package-level coverage above the current minimum where risk is high.
  - [ ] Core command behavior, history, snapping, markers, hit testing, and playback.
  - [ ] Rational time and timecode parsing/formatting edge cases.
  - [ ] React hooks and interaction components.
  - [ ] Renderer theme resolution, drawing geometry, worker fallback, and custom layer paths.
  - [ ] HTML media and Mediabunny adapter failure modes.
- [ ] Add regression tests for every known bug fixed during release hardening.
- [ ] Add integration tests for the documented quick-start path using the public package entrypoint.
- [ ] Add package-consumer smoke tests that install packed tarballs in a clean fixture.
- [ ] Add SSR/build smoke tests for consumers that import only headless packages.
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
- [ ] Add `bugs`, `author` or maintainers, and `engines` to public package manifests.
- [ ] Decide and document package `sideEffects`.
  - [ ] Mark CSS-bearing packages carefully so CSS entrypoints are not tree-shaken incorrectly.
  - [ ] Mark pure packages as side-effect free only after verifying entrypoints.
- [ ] Confirm every public package has correct `homepage`, `repository.directory`, `keywords`, `files`, `exports`, `main`, and `types`.
- [ ] Confirm all internal workspace dependencies publish as semver ranges through Changesets.
- [ ] Confirm peer dependencies are intentional and not unnecessarily narrow.
  - [ ] React peer range.
  - [ ] React DOM peer range.
  - [ ] Mediabunny peer range.
- [ ] Confirm optional peer behavior is explicit where applicable.
- [ ] Confirm CSS files are copied into `dist` and exported by both `react` and aggregate packages.
- [ ] Confirm source maps and declaration maps are intentionally included or intentionally omitted.
- [ ] Run `vp run package:check` after a clean build.
- [ ] Inspect packed tarballs for all public packages.
- [ ] Install packed tarballs into at least one clean Vite/React consumer app.

## 6. CI, Branch Protection, And Release Automation

- [ ] Require these GitHub checks before merge:
  - [ ] CI quality job.
  - [ ] Security CodeQL job.
  - [ ] Production dependency audit.
  - [ ] Changeset status.
  - [ ] Docs/build validation.
  - [ ] Package validation.
- [ ] Enforce branch protection on `main`.
  - [ ] Require pull requests.
  - [ ] Require up-to-date branches or merge queue.
  - [ ] Require linear history if that is the desired release model.
  - [ ] Block force pushes.
  - [ ] Require signed commits or document why not.
- [ ] Keep conventional commit checks for PR titles and commits.
- [ ] Confirm Dependabot PRs are grouped, reviewed, and covered by CI.
- [ ] Confirm CodeQL alerts are visible and assigned.
- [ ] Confirm `pnpm audit --prod --audit-level high` is sufficient for release, or add a broader scheduled audit.
- [ ] Confirm npm trusted publishing is configured for every public package.
- [ ] Confirm the `npm-publish` environment requires the right reviewers and secrets.
- [ ] Confirm Changesets can create release PRs and GitHub releases.
- [ ] Test a canary or snapshot release before the first public release.
- [ ] Confirm failed publish attempts are recoverable without manual package-version drift.
- [ ] Document the exact release runbook.

## 7. Security, Governance, And Community Files

- [ ] Add `SECURITY.md`.
  - [ ] Define where to report vulnerabilities.
  - [ ] Define supported versions.
  - [ ] Define expected response time.
- [x] Add `.github/CONTRIBUTING.md`.
  - [ ] Include setup with Vite+.
  - [ ] Include validation commands.
  - [ ] Include package boundary rules.
  - [ ] Include conventional commit expectations.
- [ ] Add a `CODE_OF_CONDUCT.md`.
- [ ] Add GitHub issue templates.
  - [ ] Bug report.
  - [ ] Feature request.
  - [ ] Documentation issue.
  - [ ] Performance issue.
- [ ] Add a pull request template.
  - [ ] Include tests run.
  - [ ] Include package/API impact.
  - [ ] Include docs/demo impact.
  - [ ] Include breaking-change acknowledgement.
- [ ] Add `SUPPORT.md` if support expectations differ from issue handling.
- [ ] Review repository visibility, npm organization access, and maintainer 2FA.
- [ ] Decide whether to require signed npm provenance on all public publishes.

## 8. Documentation And Examples

- [ ] Verify the README quick start works from the published package, not workspace aliases.
- [ ] Verify docs examples compile against public entrypoints.
- [ ] Verify docs package pages match package manifests and exports.
- [ ] Verify API reference generation is reproducible in CI.
- [ ] Document package selection clearly:
  - [ ] Aggregate package for React plus renderer.
  - [ ] Core for headless engine usage.
  - [ ] React for interaction primitives and hooks.
  - [ ] Renderer for canvas drawing.
  - [ ] Utils for rational time and math.
  - [ ] Adapters for media sync.
- [ ] Document styling imports and token ownership.
- [ ] Document SSR/browser support and worker behavior.
- [ ] Document accessibility guarantees and integrator responsibilities.
- [ ] Document performance model and app metadata separation.
- [ ] Document migration policy for breaking changes.
- [ ] Add troubleshooting docs for common install, bundler, CSS, peer dependency, and worker issues.
- [ ] Add a changelog page or release notes path.

## 9. Docs Site And Operational Observability

- [ ] Keep observability on the docs/demo infrastructure, not inside the open source library runtime.
- [ ] Confirm Sentry client and server DSNs are configured only for the docs site.
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
- [ ] Confirm no library package sends telemetry, metrics, network calls, or Sentry events by default.

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

- [ ] Decide supported Node versions.
- [ ] Decide supported package managers.
- [ ] Decide supported React versions.
- [ ] Decide supported browsers.
- [ ] Validate Chromium, Firefox, and Safari.
- [ ] Validate macOS, Windows, and Linux development installs if officially supported.
- [ ] Validate Vite consumer apps.
- [ ] Validate Next.js or Remix only if documented as supported.
- [ ] Validate SSR-safe imports for headless and React packages.
- [ ] Validate no DOM access occurs during server import of headless packages.

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

- [ ] GitHub governance files are not complete yet: `SECURITY.md`, `CODE_OF_CONDUCT.md`, support policy, issue templates, and PR template.
- [ ] Public package manifests do not currently advertise `bugs`, `author` or maintainers, `engines`, or `sideEffects`.
- [ ] Library packages inherit a base TypeScript config that does not currently declare `strict: true`.
- [ ] CI exists and is broad, but branch protection and required-check settings still need to be configured in GitHub.
- [ ] Package validation exists through `publint`, packed tarballs, and Are The Types Wrong, but clean consumer installation smoke tests should still be added.
- [ ] Docs/demo observability exists through Sentry metrics, but alerting, release identifiers, uptime checks, and synthetic checks still need to be confirmed.
- [ ] Coverage gates exist, including package-level line coverage, but riskier public APIs should be reviewed for behavior-driven test coverage beyond the minimum.

## Final Shape Check

- [ ] The public API is smaller than the internal implementation.
- [ ] Every public export has one clear home.
- [ ] Every package has one clear responsibility.
- [ ] CI enforces quality instead of relying on manual discipline.
- [ ] Release automation can be tested with canary packages before stable publish.
- [ ] Observability watches docs, demos, CI, publish, and uptime, not user applications.
- [ ] Documentation examples compile against published entrypoints.
- [ ] No compatibility aliases or fallback APIs remain from pre-release churn.
