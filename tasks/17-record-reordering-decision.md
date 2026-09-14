# 17 — Record the reordering decision (intent vs. value)

**Status:** done, see PROGRESS.md
**Size:** XS — documentation only, no code
**Depends on:** —
**Source:** Architecture review 2026-09-14

## Why this exists

`computeReorderPosition` ([../apps/web/src/lib/position.ts](../apps/web/src/lib/position.ts)) runs
on the **client** and sends a computed **value** (`{ position: 1.5 }`). The server stores whatever
it's given.

The alternative is sending **intent** — `{ after: todoId }` — and letting the server compute the
position against current truth.

Value-based has a real failure mode: two clients dragging at the same time each compute against
their own view of the sibling array. Under LWW the winner's *value* was computed against neighbours
that may no longer exist, so the item can land somewhere neither user intended — not merely "the
other person's drag won." That shows up in a two-user demo, which is exactly the scenario this app
gets demoed in.

## The decision, and why it's probably right anyway

**Keep value-based.** Intent-based reordering degrades badly under offline replay, which is a hard
requirement here ([../specs/06-offline-sync.md](../specs/06-offline-sync.md)):

- `{ after: Y }` replayed after Y was deleted during the offline window is ambiguous — the server
  has to invent a fallback, and whatever it picks will sometimes be wrong.
- `{ position: 1.5 }` always means something, even if the neighbours moved. It degrades to "roughly
  where the user dropped it," which is the graceful failure.

So the offline requirement makes value-based the better trade, not the lazy one. The problem is
that **nothing in the repo says so** — it currently reads as the default choice rather than a
considered one, and a reviewer probing concurrent drags will find the failure mode before they find
the reasoning.

## What to do

1. Add a bullet to PROGRESS.md's **Decisions & deviations** section stating the choice and the
   offline-replay reasoning above, plus the accepted cost (concurrent drags can land an item at an
   unintended index).
2. Add the same, more briefly, to [../specs/08-drag-and-drop.md](../specs/08-drag-and-drop.md) —
   that spec covers how `position` values are computed but not *where*.
3. Cross-reference [18](18-fractional-string-indexing.md), which changes the key type but not this
   client-vs-server decision.

## Done when

- [x] PROGRESS.md Decisions records the choice, the reasoning, and the accepted cost
- [x] specs/08 says positions are computed client-side and why
