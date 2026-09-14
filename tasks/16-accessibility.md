# 16 — Keyboard reachability and accessible names

**Status:** done
**Size:** S
**Depends on:** —
**Source:** Staff review 2026-09-12

## 1 — Focusable but invisible controls

Delete buttons and drag handles are `opacity-0` until `group-hover`:

- [TodoItem.tsx:67](../apps/web/src/components/TodoItem.tsx) (drag handle),
  [:82](../apps/web/src/components/TodoItem.tsx) (delete)
- [SubtaskItem.tsx:26](../apps/web/src/components/SubtaskItem.tsx) (drag handle),
  [:41](../apps/web/src/components/SubtaskItem.tsx) (delete)
- [LandingPage.tsx:81](../apps/web/src/pages/LandingPage.tsx) (delete)

They remain in the tab order, so a keyboard user tabs onto a **fully invisible** control with no
focus indication — and on a todo row the next thing they can activate is an irreversible delete.

**Fix:** add `focus-visible:opacity-100` everywhere `group-hover:opacity-100` appears, and make
sure a focus ring is visible against the row background.

This matters more than usual here: dnd-kit's `KeyboardSensor` is wired up with
`sortableKeyboardCoordinates` ([TodoList.tsx:45](../apps/web/src/components/TodoList.tsx),
[TodoItem.tsx:49](../apps/web/src/components/TodoItem.tsx)), so keyboard drag-and-drop is
deliberately supported — but you can't use it if you can't see the handle you've focused.

## 2 — Checkboxes have no accessible name

[TodoItem.tsx:71-76](../apps/web/src/components/TodoItem.tsx) and
[SubtaskItem.tsx:30-35](../apps/web/src/components/SubtaskItem.tsx) render a bare
`<input type="checkbox">` next to a sibling `<span>` holding the title. Nothing associates them, so
a screen reader announces an unlabeled checkbox.

**Fix:** wrap the checkbox and title in a `<label>`, or `aria-label` the input with the item title.
A `<label>` also makes the title text a click target for toggling, which is a UX win — check it
doesn't fight the drag handle or the delete button.

## 3 — The description editor is unreachable by keyboard

[TodoDescription.tsx:76-79](../apps/web/src/components/TodoDescription.tsx) puts `onClick` on a
plain `<div>`. Not focusable, not activatable by Enter/Space. Markdown descriptions are simply
unavailable to keyboard-only users.

**Fix:** make the view-mode trigger a real `<button>`, or add `role="button"`, `tabIndex={0}` and
an Enter/Space handler. A `<button>` is cleaner but check it doesn't break the rendered-markdown
layout (buttons have their own default styles and can't legally contain block content — a
`<div role="button" tabIndex={0}>` may be the pragmatic answer here).

## 4 — Quick wins while in here

- `role="status"` on the notice toast is already correct
  ([ListPage.tsx:149](../apps/web/src/pages/ListPage.tsx)) — good, leave it.
- The "Offline" pill ([ListPage.tsx:79-83](../apps/web/src/pages/ListPage.tsx)) is purely visual;
  consider `role="status"` so a connectivity change is announced.
- Presence avatars ([ListPage.tsx:86-95](../apps/web/src/pages/ListPage.tsx)) convey information via
  a `title` attribute and colour only. `title` is unreliable for screen readers — add proper text.
- The drag handle's `⠿` glyph is announced as braille characters by some screen readers. It has an
  `aria-label`, but make sure the glyph itself is `aria-hidden`.

## Verification

- Tab through the whole list with no mouse. Every control you can focus must be visible, and you
  must be able to reach and use: toggle, description editor, delete, drag handle, add-subtask.
- Perform a full drag-reorder using only the keyboard (focus handle → Space → arrows → Space).
- Run through a screen reader (VoiceOver on macOS: Cmd+F5) and confirm checkboxes announce their
  item title.
- Browser devtools accessibility audit (Lighthouse) on both pages.

## Done when

- [x] No focusable control is invisible when focused
- [x] Checkboxes announce their item title
- [x] Description editing reachable and operable by keyboard
- [x] Keyboard drag-reorder works end to end
- [x] Connectivity and presence conveyed by more than colour/`title`
