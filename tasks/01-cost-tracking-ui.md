# 01 — Cost/price UI for todos and subtasks

**Status:** done — see PROGRESS.md Completed
**Size:** M
**Depends on:** —
**Source:** Staff review 2026-09-12

## Why

[../README.md](../README.md) user story: *"I as a user can specify cost/price for a task or a
subtask - so that I can track my expenses/project cost."*

This is **not implemented**. `costCents` exists everywhere except the UI:

- `Todo.costCents Int?` and `SubTask.costCents Int?` — [../apps/server/prisma/schema.prisma](../apps/server/prisma/schema.prisma)
- `costCents` in `TodoSchema`, `SubTaskSchema`, `CreateTodoBodySchema`, `UpdateTodoBodySchema`,
  `CreateSubTaskBodySchema`, `UpdateSubTaskBodySchema` — [../packages/shared/src/index.ts](../packages/shared/src/index.ts)
- Serialized in `serializeTodo` / `serializeSubTask` — [../apps/server/src/serializers.ts](../apps/server/src/serializers.ts)
- Accepted by the generic PATCH routes already

The only references in `apps/web` are two `costCents: null` lines in the optimistic objects at
[../apps/web/src/hooks/useList.ts:183](../apps/web/src/hooks/useList.ts) and
[:298](../apps/web/src/hooks/useList.ts). So the whole backend is dead weight right now.

This is the single most visible gap for a reviewer, and the cheapest to close.

## What to do

**Server:** nothing. The PATCH routes already accept `costCents`.

**Shared:** nothing.

**Web:**

1. Add `updateTodoCost` and `updateSubTaskCost` mutations to
   [../apps/web/src/hooks/useList.ts](../apps/web/src/hooks/useList.ts). Mirror
   `updateTodoDescription` exactly — same `mutateWithOutbox` call, same `base`/conflict plumbing,
   same conflict toast via `noteConflict`. The only difference is the field. This keeps cost
   edits offline-safe and realtime-broadcast like every other field, for free.

2. New `CostInput` component under `apps/web/src/components/`. Behaves like
   [../apps/web/src/components/TodoDescription.tsx](../apps/web/src/components/TodoDescription.tsx):
   click-to-edit, commit on blur and on Enter, `Escape` discards with no PATCH sent. Display as
   currency (e.g. `$12.50`), store as integer cents. Show a muted "Add cost…" affordance when
   `costCents` is null, consistent with the description placeholder.

3. Parse defensively: strip currency symbols and thousands separators, reject non-numeric, round
   to cents. `costCents` must stay an integer — `UpdateTodoBodySchema` uses `z.number().int()`
   and will 400 on a float. Clearing the field should send `null`, not `0`.

4. Render a rollup. A todo's effective cost is a product decision — pick one, implement it, and
   **write the choice down in PROGRESS.md's Decisions section**:
   - *Recommended:* a todo shows its own cost, and separately a "subtotal" of its subtasks, so
     neither is hidden. Summing subtasks into the parent silently is surprising when the parent
     also has its own cost.
   - The list shows a grand total in the header next to the title.

5. Compute totals from the already-fetched cache — do not add an endpoint.

## Verification

- Set a cost on a todo and a subtask, hard reload, confirm both persisted.
- Set a cost while offline: it should appear immediately, be queued in IndexedDB, and land on the
  server after reconnect (same path as every other mutation — if it doesn't, the mutation wasn't
  routed through `mutateWithOutbox`).
- Open two tabs; set a cost in one and confirm it appears in the other without reload (proves the
  existing `TODO_UPDATED` / `SUBTASK_UPDATED` broadcast path covers it with no server change).
- Enter garbage (`abc`, `1.234`, `-5`) and confirm no 400 reaches the server.
- Clear a cost and confirm it round-trips as `null`, not `0`.

## Done when

- [x] Cost is viewable and editable on both todos and subtasks
- [x] Totals visible at the list level
- [x] Edits go through the outbox (offline-safe) and broadcast to other tabs
- [x] Invalid input is rejected client-side, never sent
- [x] Rollup semantics recorded in PROGRESS.md Decisions
