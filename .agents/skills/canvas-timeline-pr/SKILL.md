---
name: canvas-timeline-pr
description: Prepare Canvas Timeline pull requests with release-readiness context. Use when creating, reviewing, updating, or drafting a PR for this repo, especially when changes may affect public packages, API shape, docs demos, release automation, package metadata, CI, or the first public release checklist.
---

# Canvas Timeline PR

## Core Rule

Create PRs that are easy to merge and easy to audit against the public release
bar. Do not duplicate the release checklist in the PR body. Instead, read and
reference [.github/docs/public-release-checklist.md](file:///Users/techsquidtv/Documents/Git/canvas-timeline/.github/docs/public-release-checklist.md) when package/API, release, CI, publishing, docs, governance, or observability risk matters.

Use [git-workflow](file:///Users/techsquidtv/.codex/skills/git-workflow/SKILL.md)
for generic Git mechanics: status inspection, staging, commit naming, pushing,
and avoiding duplicate PRs.

## PR Preparation Workflow

1. Inspect the branch state:
   - `git status -sb`
   - `git log --oneline --decorate --max-count=8`
   - `git diff --stat origin/main...HEAD` when the base is `main`
2. Identify release-relevant impact by reading only the relevant sections of
   `.github/docs/public-release-checklist.md`.
3. Confirm the PR has the right release artifact:
   - Package/API changes: add or verify a Changeset.
   - Non-package changes: add an empty Changeset only when CI requires one.
   - Breaking changes before public release: call them out clearly; do not add
     backwards-compatibility aliases or fallback exports.
4. Run validation proportional to impact. Prefer already-documented Vite+ gates.
5. Draft a concise PR title and body that names impact, validation, and release
   checklist areas reviewed.

## Checklist Routing

Use the checklist as a routing map:

- Public exports or package boundaries: read sections 1, 2, 5, 8, and 10.
- React interactions, renderer, styling, demos, or accessibility: read sections
  3, 4, 8, and 10.
- CI, Changesets, branch protection, or publishing: read sections 5 and 6.
- Community files, templates, security, or governance: read sections 6 and 7.
- Docs site, Sentry, demos infrastructure, or analytics: read sections 8 and 9.
- Compatibility claims, peer dependencies, Node/package-manager support, or
  browser support: read sections 5 and 11.

If none of these apply, still skim sections 0 and 3 before opening the PR.

## Validation Guidance

Start with focused checks near the change, then scale up:

```bash
vp check
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

Use `vp run ci` for final confidence when time allows or when preparing a
release-facing PR.

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
- Checklist areas reviewed:

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
- The PR claims release readiness without referencing the checklist areas that
  were reviewed.
