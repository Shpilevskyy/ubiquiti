# 12 — Linter/formatter, `typecheck` script, CI workflow

**Status:** done (repo-wide formatting pass not applied — see PROGRESS.md)
**Size:** S
**Depends on:** —
**Source:** Staff review 2026-09-12

## Why

There is **no linter and no formatter anywhere in this repo** — no ESLint config, no Prettier
config, no Biome config, at root or in any workspace. There is also no `typecheck` script; `tsc`
only runs as a side effect of `npm run build`.

For an interview submission that reads worse than the code deserves. It's also the cheapest
possible signal to add.

## What to do

1. **Linter + formatter.** Recommend **Biome**: one dependency, one config file, covers both lint
   and format, and is fast enough to run on every save. The alternative is ESLint flat config plus
   Prettier plus the React/hooks plugins — more moving parts for the same outcome here.

   Either way, enable the React Hooks rules. `exhaustive-deps` is genuinely useful in this codebase:
   there's a deliberate dependency-array deviation at
   [useList.ts:157-160](../apps/web/src/hooks/useList.ts) that should carry an explicit
   inline disable with its existing justification, rather than being invisible.

   Configure it to run across all three workspaces (`apps/*`, `packages/*`).

2. **Scripts** at the root `package.json`:
   - `typecheck` — `tsc --noEmit` across the workspaces (note `apps/web` already has
     `noEmit: true`; server and shared emit, so they need `--noEmit` passed or a separate invocation)
   - `lint`, `format`

3. **CI** — a GitHub Actions workflow on push and PR running install → build shared → `typecheck`
   → `lint`. Keep it to that for now; the test step is parked (see
   [DEFERRED.md](DEFERRED.md)) and should be added to the same workflow whenever testing is picked
   up.

4. Expect the first lint run to surface real findings. **Fix them in a separate commit from the
   tooling setup** — a config diff mixed with a hundred auto-formatted files is unreviewable.
   Land the config, then land the fixes.

## Also worth adding while here

A toast library (**`sonner`** or `react-hot-toast`) to replace the hand-rolled notice at
[useList.ts:47-50](../apps/web/src/hooks/useList.ts) and
[ListPage.tsx:147-155](../apps/web/src/pages/ListPage.tsx). It fixes the overlapping-timer bug in
[06](06-offline-edge-cases.md) for free and handles stacking and dismissal properly. Small, but
notice queuing is not worth hand-rolling and the current version will keep accruing bugs as more
code paths raise notices (cost validation, 4xx drops, flush failures).

If you'd rather keep the dependency count down, do [06](06-offline-edge-cases.md)'s ref-based fix
instead and skip this.

## Verification

- `npm run typecheck`, `npm run lint` and `npm run build` all pass from a clean checkout.
- CI goes green on a pushed branch.
- Formatting the repo produces no behavioral diff (check `git diff --stat` is formatting-only).

## Done when

- [x] Linter + formatter configured across all workspaces
- [x] `typecheck` / `lint` / `format` scripts at the root
- [x] CI runs build + typecheck + lint on push and PR
- [x] Lint findings fixed in a separate commit from the config
