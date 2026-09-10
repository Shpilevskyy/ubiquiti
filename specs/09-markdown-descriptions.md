# 09 — Markdown Descriptions

## Scope

`descriptionMd` lives on **Todo** only (not SubTask) — a deliberate scope cut to limit surface
area; see [00-overview.md](00-overview.md) and [02-data-model.md](02-data-model.md). The user
story is read as "a longer description field for a task," not a requirement that sub-tasks carry
their own descriptions too.

## Library boundary

`react-markdown` + `remark-gfm` handle *rendering* markdown to React elements — nothing more.
The edit/view toggle, the raw-text editing surface, and persistence are ours.

## Edit/view toggle

Each Todo has a collapsible description area with two states:

- **View mode** (default when not actively editing): renders `descriptionMd` via
  `react-markdown`. Empty description shows a muted "Add a description…" placeholder.
- **Edit mode**: a plain auto-growing `<textarea>` bound to the raw markdown string. Entered by
  clicking the rendered area (or an edit icon if empty).

Saving: on blur, or `Cmd/Ctrl+Enter`, send `PATCH { descriptionMd }` through the normal
mutate/outbox path (same as any other field — offline-safe, realtime-broadcast, LWW-conflict
rules all apply identically, see [06](06-offline-sync.md)/[05](05-sync-conflict-resolution.md)).
`Escape` while editing discards the in-progress edit and reverts to the last-saved value.

## Safety

`react-markdown` renders to React elements by default (no `dangerouslySetInnerHTML`), so plain
markdown content is not an XSS vector. We will **not** add `rehype-raw` (which would allow raw
HTML passthrough) — markdown-only input, kept deliberately safe by omission rather than by
building a sanitizer.

## Realtime behavior while someone else is editing

If another client's `todo:updated` arrives (broadcasting a new `descriptionMd`) while the local
user is actively in edit mode on that same field, the incoming value is applied to the cache but
the local textarea is **not** overwritten mid-edit — it reconciles the next time the user exits
edit mode by reloading from the (now-updated) cache. This avoids yanking text out from under
someone typing; the tradeoff (documented, not fixed) is the same whole-record LWW as everywhere
else once they do save.
