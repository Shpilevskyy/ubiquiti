# Tasks

Backlog distilled from a staff-level review of the full codebase on **2026-09-12**. Each file is
self-contained: a fresh session should be able to open one, read it cold, and do the work without
re-reviewing the whole repo.

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

### Parked

See [DEFERRED.md](DEFERRED.md) — testing and making the repo private, explicitly deprioritized by
the developer on 2026-09-12.
