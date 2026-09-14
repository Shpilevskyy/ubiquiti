# 02 — Subtask progress indicator

**Status:** not started
**Size:** S
**Depends on:** —
**Source:** Staff review 2026-09-12

## Why

[../README.md](../README.md) user story: *"I as a user can add sub-tasks to my to-do items - so
that I could make logical groups of tasks **and see their overall progress**."*

The first half is done; the progress half is not. There is no count, bar, or any other progress
affordance anywhere in `apps/web`.

[../specs/11-testing-strategy.md](../specs/11-testing-strategy.md) even names a `SubtaskProgress`
component in its component-test list — it was planned and never built.

## What to do

1. New `SubtaskProgress` component under `apps/web/src/components/`. Props: the todo's subtasks
   (or just `done` / `total` counts — prefer counts, it makes the component trivial to test).
2. Render it in [../apps/web/src/components/TodoItem.tsx](../apps/web/src/components/TodoItem.tsx),
   in the header row next to the title. Hide it entirely when a todo has no subtasks — an empty
   `0/0` on every bare todo is noise.
3. Keep it small and quiet: a `3/5` count with a thin bar is enough. It sits inside a dense list;
   it should not compete with the title.
4. Derive from props only. No new state, no new query — `todo.subtasks` is already in the cache
   and already updates from both optimistic writes and realtime broadcasts.

## Verification

- Toggle a subtask and confirm the count updates instantly (optimistic path).
- Toggle a subtask in a second tab and confirm the first tab's count updates without reload
  (realtime path).
- Add and delete subtasks; confirm the denominator tracks.
- Confirm a todo with zero subtasks renders no progress element at all.

## Done when

- [ ] Each todo with subtasks shows done/total progress
- [ ] Updates on optimistic, realtime, and refetch paths
- [ ] Absent for todos with no subtasks
