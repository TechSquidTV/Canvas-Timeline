# Contributing

Canvas Timeline is in alpha. The first planned public release is `0.0.1`.
Breaking changes are acceptable before `1.0.0`, but call them out clearly in
changesets and pull request descriptions. Do not add backwards-compatibility
aliases, deprecated fallbacks, or duplicate API surfaces while changing public
package shape.

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
vp run build
vp run package:check
```

`vp run package:check` builds publishable packages and validates packed package
metadata with `publint` and `attw`.

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

Releases are managed by Changesets and GitHub Actions. When changes land on
`main`, the Release workflow runs validation and then invokes
`changesets/action`.

The action has two outcomes:

- If unreleased changesets exist, it opens or updates the release pull request:
  `chore(release): version packages`.
- If the versioned release pull request has already been merged, it runs
  `vp run release:publish`, publishes packages to npm, and creates GitHub
  releases.

`vp run release:publish` runs `vp run repo:package:check` before
`changeset publish`. That means release publishing builds packages, validates
their publishable shape, and only then publishes.

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
