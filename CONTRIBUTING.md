# Contributing to Project Orchestrator (frontend)

## Development

```bash
npm ci
npm run lint
npm run build      # typecheck + production build
npx vitest run --coverage
```

## Git workflow

### Branch naming

| Prefix | Use |
|---|---|
| `docs/<domain>` | documentation and diagrams only for a domain |
| `fix/<domain>-<subject>` | bug fix |
| `test/<domain>-<subject>` | tests only |
| `chore/<subject>` | tooling, CI, maintenance |

### One PR = one vertical slice

A pull request carries a complete slice: the fix, a regression test that
**fails without the fix** (paste the failing command and output in the PR),
the updated diagram under `docs/diagrams/<name>.mmd` (or an explicit
`Diagram-Unchanged: <name> — <reason>`), and the documentation. Diagram-only
PRs describing unverified code are not accepted. The PR template checklist
must be fully ticked; an unticked box means the PR is not mergeable.

Always report coverage as two figures when both exist: **raw** and **gated**
(see `docs/COVERAGE.md`). Never exclude code from coverage to make a number pass.

### Pushing

Never push directly to `main`. Push your branch with an explicit refspec:

```bash
git push origin HEAD:refs/heads/<branch>
```

Do not create releases, tags or version bumps in a feature PR.



### Patch coverage gate

CI runs `scripts/check-patch-coverage.mjs` after `vitest run --coverage`. It
fails when fewer than **80%** of the executable lines added or changed by the PR
are covered (threshold set by `PATCH_COVERAGE_THRESHOLD` in
`.github/workflows/ci.yml`; default in the script is also 80). Known limit: a
changed file that no test executes at all is skipped by the gate, so cover the
code you touch in a test that actually imports it. Overall coverage is
documented in `docs/COVERAGE.md`.
