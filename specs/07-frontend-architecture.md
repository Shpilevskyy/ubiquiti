# 07 — Frontend Architecture

## Routes

| Path | Page | Purpose |
|---|---|---|
| `/` | `LandingPage` | create a new list → `POST /api/lists` → redirect to `/list/:id` |
| `/list/:id` | `ListPage` | the collaborative board |

## Component tree

```
App
├── LandingPage
└── ListPage
    ├── ListHeader        (title, edit-title, share/copy-link button, presence avatars,
    │                       connection status indicator)
    ├── TodoList           (DndContext + SortableContext over todos)
    │   ├── TodoItem       (checkbox, title, cost, drag handle, expand toggle)
    │   │   ├── SubtaskList (nested SortableContext)
    │   │   │   └── SubtaskItem (checkbox, title, cost, drag handle)
    │   │   ├── SubtaskProgress   (doneCount / totalCount, derived)
    │   │   ├── AddSubtaskForm
    │   │   └── DescriptionEditor (markdown edit/view toggle)
    │   └── AddTodoForm
    └── ToastLayer          (offline/reconnect/error/"edited elsewhere" notifications)
```

## State layers

| Layer | Tool | Owns |
|---|---|---|
| Server state / cache | TanStack Query (`['list', listId]`) | list + todos + subtasks, hydrated via REST GET, updated via mutation responses and socket events |
| Mutations | `useMutation` wrapping the outbox's `mutate()` (see [06-offline-sync.md](06-offline-sync.md)) | optimistic cache updates + queuing |
| Realtime | `useListSocket(listId)` hook | joins/leaves the room, applies incoming broadcast events to the query cache, tracks presence |
| Ephemeral UI state | React state / a small Zustand store | drag-in-progress state, which description is in edit mode, connection status, local identity (name/color) |

## Folder structure (`apps/web/src`)

```
src/
├── pages/           # LandingPage, ListPage
├── components/       # TodoItem, SubtaskItem, DescriptionEditor, ListHeader, ToastLayer, ...
├── hooks/            # useListQuery, useListSocket, useOutbox, useConnectionStatus
├── lib/
│   ├── api.ts         # typed fetch wrapper (uses packages/shared types)
│   ├── socket.ts       # Socket.IO client singleton + event wiring
│   └── outbox.ts        # IndexedDB-backed queue (idb-keyval)
└── types → re-exported from packages/shared
```

## Data flow for a mutation (e.g. toggling "done")

1. User clicks checkbox → component calls `useMutation`'s trigger.
2. `outbox.mutate({ method: 'PATCH', path, body })`:
   - optimistic `setQueryData` flips `done` locally, instantly
   - op persisted to IndexedDB outbox
   - if online, `fetch` sent immediately
3. On success response: cache reconciled with server's authoritative row (picks up new
   `version`/`updatedAt`); op removed from outbox.
4. Other connected clients receive `todo:updated` over the socket and apply the same update to
   their own cache (see [04-realtime-protocol.md](04-realtime-protocol.md)).
5. If offline at step 2, the optimistic update stands, the op stays queued, and it's flushed per
   [06-offline-sync.md](06-offline-sync.md) once connectivity returns.
