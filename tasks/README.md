# Tasks

Backlog from two reviews: a full code review of all three workspaces on **2026-09-12** (tasks
01–16) and an architecture review on **2026-09-14** (tasks 17–22), plus the testing plan written on
**2026-09-15** (task 23). Each file is self-contained: a fresh session should be able to open one,
read it cold, and do the work without re-reviewing the whole repo.

**Already landed (2026-09-14), not in this backlog:** conflict detection rewritten from row-`version`
to per-field `base` values, a `version`-based ordering guard on the realtime update handlers, and
unconditional resync after a reconnect-triggered outbox flush. See PROGRESS.md. Tasks
[04](04-route-scoping-and-conflict-check.md) and [05](05-cache-reconciliation.md) were revised to
match — read their update notes before starting either.

## How to work these

- **One task per change.** Each file is sized to be a diff a senior engineer can review in one
  sitting, per [../CLAUDE.md](../CLAUDE.md). Don't batch several together.
- **Respect `Depends on`.** Some tasks assume an earlier one landed (noted in each file's header).
- **Update the `Status:` line** in the task file when you finish, and add the corresponding entry
  to [../PROGRESS.md](../PROGRESS.md)'s Completed section the way existing entries are written
  (what changed, why, how it was verified).
- **Never commit without the developer reviewing the diff first** — repo rule, no exceptions.

## Order

Grouped by priority. Within a group, order is roughly by value-per-line-of-diff.

### P1 — Unimplemented user stories from the brief

These are the visible gaps against [../README.md](../README.md)'s user-story list. Backends are
already fully built for both; this is UI-only work.

| # | Task | Size |
|---|------|------|
| [01](01-cost-tracking-ui.md) | Cost/price UI for todos and subtasks | M |
| [02](02-subtask-progress.md) | Subtask progress indicator | S |

### P2 — Sync and offline correctness bugs

The offline/realtime layer is the most interesting part of this app and therefore the part a
reviewer will probe hardest. These are real defects found by reading the code, not speculation.

| # | Task | Size |
|---|------|------|
| [03](03-outbox-reliability.md) | Outbox atomicity, poison ops, single-flight flush | M |
| [04](04-route-scoping-and-conflict-check.md) | Scope todo/subtask routes to parent id; fix TOCTOU conflict check | M |
| [05](05-cache-reconciliation.md) | Stop per-mutation full-list refetch clobbering optimistic state | M |
| [06](06-offline-edge-cases.md) | Paused-query crash, `deleteList` while offline, toast timers | S |

### P3 — Structure and refactoring

Nothing here is broken; it's about the code staying readable as it grows.

| # | Task | Size |
|---|------|------|
| [07](07-extract-outbox-sync.md) | Move the flush scheduler out of `useList` into a plain module | M |
| [08](08-list-context.md) | `ListProvider` context to kill prop drilling; push input state down | M |
| [09](09-server-route-boilerplate.md) | `request.clientId`, schema-driven validation, central P2025 handling | M |
| [10](10-dead-code-cleanup.md) | Delete unreachable API helpers, hello scaffold, stale comments | S |

### P4 — Tooling and polish

| # | Task | Size |
|---|------|------|
| [11](11-tailwind-typography.md) | Replace the arbitrary-variant class soup with `@tailwindcss/typography` | S |
| [12](12-tooling-lint-ci.md) | Linter/formatter, `typecheck` script, CI workflow | S |
| [16](16-accessibility.md) | Keyboard reachability and accessible names | S |

### P5 — Completing the offline story

| # | Task | Size |
|---|------|------|
| [13](13-offline-app-shell.md) | PWA app shell + query persistence so a cold offline load works | L |

### P6 — Production hardening

| # | Task | Size |
|---|------|------|
| [14](14-server-hardening.md) | Graceful shutdown, rate limit, helmet, body cap, real healthz, pagination | M |
| [15](15-db-indexes.md) | Composite indexes on `(listId, position)`; touch `List.updatedAt` | S |

### P7 — Architecture (from the 2026-09-14 design review)

Different in kind from the above: these are design decisions rather than defects. Two are
ten-minute documentation tasks and two are deliberately parked with explicit trigger conditions —
read the status line before planning work.

| # | Task | Size |
|---|------|------|
| [17](17-record-reordering-decision.md) | Record the reordering decision (intent vs. value) | XS — docs |
| [21](21-record-transport-decision.md) | Record the transport decision (Socket.IO vs. SSE) | XS — docs |
| [18](18-fractional-string-indexing.md) | String fractional indexing instead of `position: Float` | M |
| [19](19-transaction-boundaries.md) | Transaction boundaries; collapse redundant round trips | S–M |
| [20](20-service-layer.md) | Service layer between routes and Prisma | L — **parked** |
| [22](22-horizontal-scale-redis.md) | Redis adapter for multi-instance realtime | M — **parked** |

**17 and 21 are worth doing before any interview.** Neither changes code — they record reasoning
that currently exists nowhere, for two decisions (client-computed drag positions; Socket.IO over
SSE) that a reviewer is likely to probe. Right now both read as defaults rather than choices.

**20 and 22 are parked on purpose**, with the conditions that should un-park them written into each
file. 22 has a cheap interim step worth taking now: document that single-instance deployment is a
requirement, not an accident.

### P8 — Testing

Un-parked on 2026-09-15. Unlike every other entry above, [23](23-testing.md) is **one file covering
eight sequential steps**, each its own session and PR — the shared tooling decisions and test-harness
hazards are stated once rather than duplicated across eight files. Read its `How to work this`
section before starting.

| # | Task | Size |
|---|------|------|
| [23](23-testing.md) | Test tooling, harnesses, and the suites worth writing | L — 8 steps |

**Steps 1 and 2 are prerequisites**, and step 2 is a refactor with no tests in it: the server cannot
currently be tested at all, because `index.ts` calls `app.listen()` at module scope and so can't be
imported. Steps 4–8 can be reordered or cut without breaking each other.

### Parked

See [DEFERRED.md](DEFERRED.md) — making the repo private. Testing was also parked there on
2026-09-12 and has since been picked back up as [23](23-testing.md).
