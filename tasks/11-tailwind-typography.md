# 11 — Replace the arbitrary-variant class soup with `@tailwindcss/typography`

**Status:** not started
**Size:** S
**Depends on:** —
**Source:** Staff review 2026-09-12

## Why

[../apps/web/src/components/TodoDescription.tsx:78](../apps/web/src/components/TodoDescription.tsx)
carries a **~400 character** `className` built from arbitrary variants:

```
[&_a]:text-indigo-600 [&_a]:underline [&_blockquote]:border-l-2 ... [&_:is(h1,h2)]:font-semibold
... [&_ol]:list-decimal [&_p]:mb-1 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4
```

This is hand-rebuilding, one selector at a time, exactly what `@tailwindcss/typography` exists to
provide. It's also already proven brittle: per PROGRESS.md, the first version missed headings
entirely (Tailwind's Preflight resets `h1`–`h6` to `inherit`), a user caught it in production, and
it was patched by appending more variants. That failure mode repeats for every element type nobody
thought to test — tables (which `remark-gfm` enables!), `hr`, nested lists, `pre`, `strong`, task
lists.

## What to do

1. Add `@tailwindcss/typography`. For Tailwind v4 (this repo uses the
   [`@tailwindcss/vite`](../apps/web/vite.config.ts) plugin), register it from CSS in
   [../apps/web/src/index.css](../apps/web/src/index.css) with `@plugin "@tailwindcss/typography";`
   — **not** via a `tailwind.config.js` `plugins` array, which is the v3 pattern. There is no
   `tailwind.config.js` in this repo and there's no reason to add one.

2. Replace the whole arbitrary-variant string with `prose prose-sm` plus whatever small overrides
   the dense list context actually needs (likely `max-w-none`, and tightening vertical margins —
   `prose` is tuned for article width, not for a nested row in a todo list).

3. Keep the non-typography classes on that element: `mt-1 cursor-text rounded-md px-2 py-1
   hover:bg-slate-50` and the `onClick`. Only the `[&_...]` selectors go.

4. Do **not** add `rehype-raw` or otherwise enable raw HTML. The current setup renders raw HTML as
   literal escaped text, which was verified by pasting an `<img onerror=...>` payload and
   confirming no element was created (PROGRESS.md, markdown entry). That's the security boundary
   specced in [../specs/09-markdown-descriptions.md](../specs/09-markdown-descriptions.md) and this
   task must not weaken it.

## Verification

Write one description exercising the full range and eyeball it: headings h1–h6, bold, italic,
links, inline code, fenced code, unordered and ordered lists, nested lists, blockquote, horizontal
rule, and a **GFM table** (tables are the most likely current gap — `remark-gfm` emits them and the
existing class list has no `[&_table]` rules at all).

Re-verify the XSS case: paste `<img src=x onerror="alert(1)">` and confirm it renders as visible
text with no element created.

Check the todo list doesn't visually blow out — `prose` defaults are generous and this renders
inside a narrow indented row.

## Done when

- [ ] `@tailwindcss/typography` registered via `@plugin` in `index.css`
- [ ] Arbitrary-variant string replaced with `prose prose-sm` + minimal overrides
- [ ] Tables, nested lists and `hr` render correctly (they don't today)
- [ ] Raw HTML still renders as escaped text
- [ ] Row density unchanged
