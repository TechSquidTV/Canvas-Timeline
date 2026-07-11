---
name: canvas-timeline-pr
description: Prepare Canvas Timeline pull requests with release-readiness context. Use when creating, reviewing, updating, or drafting a PR for this repo, especially when changes may affect public packages, API shape, docs demos, release automation, package metadata, CI, or publishing.
---

# Canvas Timeline PR

## Core Rule

Create PRs that are easy to merge and easy to audit against the public release
bar. Keep the release-impact analysis in the PR body concise, concrete, and tied
to the files that changed.

Use [git-workflow](file:///Users/techsquidtv/.codex/skills/git-workflow/SKILL.md)
for generic Git mechanics: status inspection, staging, commit naming, pushing,
and avoiding duplicate PRs.

## PR Preparation Workflow

1. Inspect the branch state:
   - `git status -sb`
   - `git log --oneline --decorate --max-count=8`
   - `git diff --stat origin/main...HEAD` when the base is `main`
   - `.github/workflows/*.yml` for required PR checks that apply to the
     changed files.
   - Commitlint or repository commit-scope configuration before choosing a PR
     title or commit message scope.
2. Identify release-relevant impact for package/API, docs/demo, CI, publishing,
   governance, and compatibility changes.
3. Confirm the PR has the right release artifact:
   - Package/API changes: add or verify a Changeset.
   - Non-package changes: add an empty Changeset whenever the Changeset status
     workflow is required for PRs.
   - Breaking changes before public release: call them out clearly; do not add
     backwards-compatibility aliases or fallback exports.
4. Run validation proportional to impact. Prefer already-documented Vite+ gates.
5. For stacked cleanup PRs, base later PRs on the smallest earlier branch that
   provides required CI/config fixes instead of duplicating those commits.
6. Draft a concise PR title and body that names impact, validation, and any
   release-relevant risk.
7. After opening the PR, run `gh pr checks <number>` or inspect the check
   rollup. If a required check fails, inspect the failing log before declaring
   the PR ready.

## Release Impact Routing

Use the changed files as a routing map:

- Public exports or package boundaries: inspect exported types, package entrypoints,
  Changesets, and docs/API examples.
- React interactions, renderer, styling, demos, or accessibility: inspect DOM/canvas
  split, keyboard/pointer behavior, hit targets, visual regressions, and demo usage.
- CI, Changesets, branch protection, or publishing: inspect workflows, package
  metadata, release artifacts, and package validation output.
- Community files, templates, security, or governance: inspect policy files and
  public contributor-facing docs.
- Docs site, demos infrastructure, analytics, or observability: inspect docs build,
  source-backed demos, generated metadata, and runtime configuration.
- Compatibility claims, peer dependencies, Node/package-manager support, or browser
  support: inspect package metadata, build targets, and documented support claims.

If none of these apply, state that release impact is not applicable.

## Validation Guidance

Start with focused checks near the change, then scale up:

```bash
vp run repo:check
vp test
vp run custom:rules
vp run knip
```

For package surface, docs, release, or broad refactors, add relevant gates:

```bash
vp run repo:typecheck
vp run --filter @techsquidtv/canvas-timeline-www docs:demos
vp run --filter @techsquidtv/canvas-timeline-www docs:registry
vp run repo:build
vp run repo:package:check
```

Use `vp run repo:package:validate` only after `vp run repo:build` when you want
to validate already-built package `dist` output without repeating the clean
package rebuild.

Use `vp run ci` for final pull request confidence. It includes the quality
checks, docs/app build, and package validation against the built package output.
Add `vp run repo:package:check` when release or package metadata risk warrants
the clean package rebuild path.

Before opening a PR, validate the PR title locally when commitlint runs on pull
request titles:

```bash
printf '%s\n' "<type>(<scope>): <summary>" | vp exec commitlint --verbose
```

## PR Body Shape

Keep the body short and reviewer-oriented:

```markdown
## Summary

- ...
- ...

## Release Impact

- Packages/API:
- Docs/demos:
- Breaking changes:
- Release risk:

## Validation

- `...`
```

Prefer “None” or “Not applicable” over leaving release-impact fields ambiguous.
Mention exact checklist section numbers rather than copying checklist items.

## Red Flags

Pause and resolve before opening or marking ready for review when:

- Public package exports changed but there is no Changeset decision.
- A PR adds compatibility aliases, deprecated fallbacks, or duplicate public
  APIs during pre-release hardening.
- Docs examples or demos import private workspace paths instead of public package
  entrypoints.
- Package metadata changed without running package or docs registry checks.
- The PR claims release readiness without naming the package, docs, CI, or
  publishing areas that were reviewed.
