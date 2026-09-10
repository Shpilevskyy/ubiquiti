# 10 — Sharing & Presence

## Sharing model

A list's share link is simply `${origin}/list/:id`, where `:id` is the server-generated UUID
from `POST /api/lists` (see [03-api-rest.md](03-api-rest.md)). Anyone with the link can view and
edit — there is no read-only link variant and no authentication, per the explicit scope decision
in [00-overview.md](00-overview.md).

`ListHeader` has a "Share" button that copies the current URL via
`navigator.clipboard.writeText` and shows a brief confirmation toast. No backend involvement
beyond the list already existing.

## Anonymous identity (for presence, not auth)

On first visit, the client generates a lightweight local identity:

```ts
{ id: crypto.randomUUID(), name: randomAdjective + ' ' + randomAnimal, color: randomFromPalette() }
```

- `id` and `color` persist in `localStorage` (`ubq-todo:identity`) — stable across sessions/tabs
  on the same browser.
- `name` is editable in the UI (click your own presence avatar to rename); the edited name is
  also saved back to `localStorage`.

This identity is sent on the socket's `list:join` event (see
[04-realtime-protocol.md](04-realtime-protocol.md)) purely to label presence — it is not a user
account and grants no special permissions (everyone with the link has the same access).

## Presence UI

`ListHeader` shows a row of small colored avatars/initials for everyone currently viewing the
list, sourced from `presence:update` broadcasts. This is the concrete, visible payoff of "you can
collaborate in real time" — seeing who else is there, not just that edits appear.

## Out of scope

- Per-link permission levels (view-only vs edit)
- Revoking/regenerating a share link
- Any notion of a "list owner"
