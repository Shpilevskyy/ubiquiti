# 00 — Overview

## Purpose

Ubiquiti full-stack test assignment: a collaborative to-do list app.
Technical constraints given by the assignment: **TypeScript, React (frontend), Node (backend)**.

This directory holds the spec-driven design docs for the project. Each doc covers one concern;
implementation should follow what's written here, and any deviation should be reflected back
into the relevant spec before/alongside the code change.

**These docs are design intent, not an as-built record.** Where the implementation has diverged —
deliberately or otherwise — [../PROGRESS.md](../PROGRESS.md) is the authoritative account of what
was actually built and why, and [../tasks/](../tasks/) is the backlog of known gaps. Read a spec
for the reasoning behind a decision; read PROGRESS.md for the current state of the code. Known
standing divergences: the component tree in [07-frontend-architecture.md](07-frontend-architecture.md)
lists components that were never split out (`ListHeader`, `ToastLayer`, `SubtaskProgress`,
`AddSubtaskForm`, `AddTodoForm`) and a `lib/socket.ts` singleton that lives inside `useListSocket`
instead; the Zustand dependency in [01-architecture.md](01-architecture.md) was never added
(a `useSyncExternalStore` module singleton covers the same ground more cheaply).

## Library-use policy

> "It's all right to use libraries that make your life easier, but please avoid anything that
> handles the core challenge for you." — assignment notes

Agreed interpretation:

- **Not allowed**: any library that *is* the thing a user story is testing — a pre-built
  todo/task-list framework, a CRDT/sync library (e.g. Yjs, Automerge) that would solve realtime
  sync + offline persistence + conflict resolution all at once, a full offline-sync framework
  (RxDB, WatermelonDB, PouchDB).
- **Allowed**: single-purpose helper libraries that solve one narrow, well-understood
  sub-problem and leave the actual app logic to us — e.g. `dnd-kit` (drag *interactions*, not
  reorder/persist logic), `react-markdown` (rendering, not the edit/view toggle or storage),
  an IndexedDB wrapper (storage primitive, not sync/merge logic), an ORM (query building, not
  our data model or API design), a UI component/styling library.

Rule of thumb: if a library would let us skip *writing* the realtime broadcast logic, the
conflict-resolution rule, or the offline queue/replay logic ourselves, we don't use it there.

## Selected user stories

⭐ = required by the assignment.

| # | Story | Priority | Phase |
|---|-------|----------|-------|
| 1 | ⭐ Create to-do items (e.g. grocery list) | Must | 1 |
| 2 | Mark to-do items as done | Must | 2 |
| 3 | Persist to-dos across server restarts | Must | 1 |
| 4 | Reorder tasks via drag & drop | Should | 2 |
| 5 | Sub-tasks with overall progress | Should | 2 |
| 6 | Cost/price per task or sub-task | Should | 2 |
| 7 | Share list via a unique link | Should | 3 |
| 8 | Real-time collaboration on a shared list | Should | 3 |
| 9 | Markdown descriptions (edit as MD, view as rich text) | Could | 4 |
| 10 | Offline editing with sync on reconnect | Could | 5 |

Testing ([11-testing-strategy.md](11-testing-strategy.md)) is a deliberate **Phase 6, done last**
— after the feature set above works end-to-end — rather than written alongside each phase. For a
time-boxed assignment, a working feature set is worth more than partial tests around a partially
working app.

**Assumption to confirm:** implement all ten stories in the phased order above. If time runs
short, cut from the bottom (offline sync first, then realtime collaboration) since they're the
highest effort/risk and the rest of the app still stands on its own without them. Flag if you'd
rather reprioritize (e.g. drop cost/price or markdown instead to protect realtime/offline).

## Out of scope

- User accounts / authentication (lists are access-by-link; see
  [10-sharing-and-presence.md](10-sharing-and-presence.md))
- Multiple lists per "user" as a managed dashboard (a list is the unit of sharing/collaboration;
  a landing page to create a new list is in scope, a full "my lists" account area is not)
- Fine-grained permissions (view-only vs edit links) — single edit-access link only, unless we
  have spare time
- Mobile app / PWA installability (responsive web only)

## Success criteria

- All "Must"/"Should" stories work end-to-end against the hosted deployment
- Data survives a server restart
- Two browser tabs on the same list see each other's changes live
- README documents which stories were implemented and any known gaps
