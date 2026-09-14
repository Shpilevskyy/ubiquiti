# 08 — `ListProvider` context to kill prop drilling; push input state down

**Status:** not started
**Size:** M
**Depends on:** [07](07-extract-outbox-sync.md) (the context will call `useList`, and without 07's
reference-counted sync loop a second call site spawns a second poller)
**Source:** Staff review 2026-09-12

## Why

`useList` returns 13 values. [ListPage.tsx:108](../apps/web/src/pages/ListPage.tsx) maps them into
**11 props** on `TodoList`, which maps those into **10 props** on `TodoItem`
([TodoList.tsx:60-76](../apps/web/src/components/TodoList.tsx)), which passes more down to
`SubtaskItem`. `ListPage` has become a switchboard: roughly a third of the file is prop plumbing.

Every one of those callbacks is a freshly allocated inline arrow, so `React.memo` on the row
components would do nothing without also wrapping every callback in `useCallback`. The components
were extracted for good reason (dnd-kit's `useSortable` is a hook and can't be called inside a
`.map()`), but the data flow didn't follow them down.

Second, separate problem: `newSubTaskTitles: Record<string, string>` is lifted all the way to the
page ([ListPage.tsx:11](../apps/web/src/pages/ListPage.tsx)) even though each entry is read by
exactly one `TodoItem`. Consequence: **a keystroke in any subtask input re-renders every todo, every
subtask, and all N `DndContext`s.**

## What to do

1. `apps/web/src/context/ListContext.tsx` (or similar): a `ListProvider` that calls `useList(listId)`
   once and exposes the list data plus the action callbacks. `ListPage` renders the provider;
   `TodoItem` and `SubtaskItem` pull what they need via a `useListActions()` hook.

   Target prop surface: `TodoItem` takes `todo`, `SubtaskItem` takes `subtask`. That's it.

2. Move subtask-input state into an `AddSubtaskForm` component owned by `TodoItem`. Delete
   `newSubTaskTitles`, `onSubTaskTitleChange`, `onAddSubTask`, and `handleAddSubTask` from the page
   entirely. `newTodoTitle` can stay at page level (it genuinely belongs there), though an
   `AddTodoForm` component would be tidier and matches
   [../specs/07-frontend-architecture.md](../specs/07-frontend-architecture.md)'s component tree.

3. With the prop surface collapsed, `React.memo` on `TodoItem`/`SubtaskItem` becomes worthwhile —
   add it once the callbacks come from a stable context value rather than inline arrows. Make sure
   the context value itself is memoized, or it defeats the whole exercise.

   Alternative worth considering instead of hand-memoizing: React 19 ships with the React Compiler
   available as a Babel plugin. If you'd rather not scatter `useCallback`/`memo`, that's the modern
   answer — but treat it as its own decision and record it in PROGRESS.md.

## Not in scope

Each `TodoItem` currently creates its own `DndContext` plus two sensors
([TodoItem.tsx:47-50](../apps/web/src/components/TodoItem.tsx)) — N contexts for N todos. It works,
and it's the simplest way to get "no cross-todo subtask dragging" per
[../specs/08-drag-and-drop.md](../specs/08-drag-and-drop.md). A single top-level `DndContext` with
per-todo `SortableContext` and container-aware collision detection is the more usual pattern and
would be lighter, but it's a real behavior-risk change. Leave it; note it if a reviewer asks.

## Verification

Pure refactor, no behavior change. Exercise the full matrix, since this touches every interaction:

- add/toggle/delete todo and subtask
- drag-reorder a todo, and a subtask within a todo; hard reload and confirm order persisted
- edit a description, save on blur and on Cmd/Ctrl+Enter, discard with Escape
- two tabs: confirm realtime still applies in both directions
- offline: add a todo, reconnect, confirm it syncs

Then confirm the perf goal: typing in one subtask input must not re-render other todos (React
DevTools Profiler, or a temporary render counter).

## Done when

- [ ] `TodoItem` takes `todo`; `SubtaskItem` takes `subtask`
- [ ] `newSubTaskTitles` and its two callbacks are gone from `ListPage`
- [ ] Typing in a subtask input re-renders only that row
- [ ] Full interaction matrix verified unchanged
