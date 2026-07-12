# Contributing

## Setup

Install dependencies with Vite+ before working:

```bash
vp install
```

Common development commands:

```bash
vp run dev
vp run dev:www
vp run repo:check
vp test
```

Commit hooks are managed by Vite+. `vp install` runs the `prepare` script, which
configures `.vite-hooks`. Refresh hook setup manually with:

```bash
vp config --hooks-dir .vite-hooks --no-agent
```

Run staged-file formatting and linting before committing with:

```bash
vp staged
```

## Package Boundaries

Keep changes in the lowest appropriate package:

- `packages/utils` contains rational time and shared math.
- `packages/core` contains the framework-free timeline engine, state, editing,
  playback, history, clipboard, snapping, markers, and keyframes.
- `packages/react` contains providers, hooks, DOM interaction layers, scrollbars,
  and package-owned CSS.
- `packages/renderer` contains canvas drawing, worker rendering, and theme
  resolution.
- `packages/html-media-adapter` contains HTMLMediaElement media sync helpers.
- `packages/mediabunny-adapter` contains Mediabunny media and frame access
  helpers.
- `packages/timeline` is the aggregate public package and should stay a thin
  composition layer.
- `apps/www` is the Astro documentation site, source-backed demo registry, and
  primary QA playground.

Keep TypeScript strict. Do not introduce `any`; avoid `unknown` unless the API
intentionally accepts external data, such as metadata. Before adding a new type,
helper, or public export, check for an existing one to avoid duplicate API
surfaces.

## Validation

Run focused tests near your change, then use the broader gates when the change
touches shared behavior or package surfaces:

```bash
vp run repo:check
vp test
vp run ci
vp run package:check
```

`vp run ci` mirrors the pull request CI shape: static quality, tests with
coverage, docs/app build, and package validation against the built package
output.

`vp run package:check` performs a clean publishable package build, then validates
packed package metadata with `publint`, Are The Types Wrong, and the packed
tarball consumer smoke test. Use `vp run package:validate` only when package
`dist` output has already been built and should be reused.

## Changesets

Pull requests to `main` must include a changeset or an empty changeset. CI
checks this with:

```bash
vp exec changeset status --since=origin/main
```

Create a changeset with:

```bash
vp run changeset
```

Use an empty changeset only for changes that do not affect published package
contents or release notes.

## Release Publishing

Releases are managed by Changesets and GitHub Actions. A maintainer manually
dispatches the Release workflow from `main`; it runs validation and then invokes
`changesets/action`.

TechSquidTV is the release owner and fallback owner for npm, GitHub, docs, and
incident response. This repository is maintained by a solo developer, so the
release process relies on protected `main`, required CI checks, manual dispatch
controls, npm trusted publishing, and conventional commits rather than GitHub
environment approval flows.

The action has two outcomes:

- If unreleased changesets exist, it opens or updates the release pull request:
  `chore(release): version packages`.
- If the versioned release pull request has already been merged, it runs
  `vp run release:publish`, publishes packages to npm, and creates GitHub
  releases.

`vp run release:publish` runs `vp run repo:package:check` before
`changeset publish`. That means release publishing builds packages, validates
their publishable shape, and only then publishes.

### First public release

The `0.1.0` release is intentionally published from a clean local checkout after
the version PR merges. Do not enable `ENABLE_PACKAGE_PUBLISH` or dispatch the
stable Release workflow for this one-time bootstrap release.

1. Check out and pull `main`, then verify that the worktree is clean and every
   publishable package is versioned at `0.1.0`.
2. Authenticate npm as a release owner. Local publishing does not use GitHub's
   trusted-publishing OIDC identity, so the local npm session must be authorized
   to publish every package in the `@techsquidtv` scope.
3. Run `vp run release:publish`. The task performs a clean package build,
   validates the packed artifacts, publishes all unpublished packages with the
   default `latest` dist-tag, and creates package-specific local Git tags.
4. Verify all seven package versions and the `latest` dist-tag on npm before
   pushing tags.
5. Push the package tags with `git push origin --follow-tags`.
6. Create one GitHub release from each package tag, using the matching package
   changelog entry as its notes.

The expected tags are:

```text
@techsquidtv/canvas-timeline@0.1.0
@techsquidtv/canvas-timeline-core@0.1.0
@techsquidtv/canvas-timeline-html-media-adapter@0.1.0
@techsquidtv/canvas-timeline-mediabunny-adapter@0.1.0
@techsquidtv/canvas-timeline-react@0.1.0
@techsquidtv/canvas-timeline-renderer@0.1.0
@techsquidtv/canvas-timeline-utils@0.1.0
```

After this bootstrap release, use the GitHub Release workflow for normal stable
publishing and keep local publishing only as the documented fallback.

Manual snapshot publishes are available from the Release workflow. They run
Changesets snapshot versioning and publish with the requested npm dist-tag,
defaulting to `canary`, without creating git tags.

The separate Canary Validation workflow versions, builds, and validates
snapshot packages without publishing them.

## Commits

Use conventional commit messages, with a scope when one is clear:

```text
feat(react): add timeline track control hook
fix(renderer): clamp marker label bounds
docs: document package selection
```

Do not include agent names in branch names or commit messages.
