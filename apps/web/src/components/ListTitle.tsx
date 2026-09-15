import { useEffect, useRef, useState } from 'react';

interface ListTitleProps {
  title: string;
  onSave: (title: string) => void;
}

// Click-to-edit, mirroring CostInput/TodoDescription's edit/view toggle (specs/09's pattern,
// reused here for specs/03-api-rest.md's PATCH /lists/:listId "rename" — server support and the
// LIST_UPDATED broadcast for it already existed; this was the missing client half). Commits on
// blur and on Enter; Escape discards. An empty or unchanged draft is silently discarded rather
// than sent — UpdateListBodySchema requires a non-empty title, and there's nothing to save if it
// didn't change.
//
// A real <button>, unlike CostInput/TodoDescription's `role="button"` span/div: those sit inline
// next to other controls in a row, but this is a bare heading with nothing else to share space
// with, so nothing stops it from being a natively focusable, natively keyboard-activatable
// element instead of one wearing the role.
export function ListTitle({ title, onSave }: ListTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  function startEditing() {
    setDraft(title);
    committedRef.current = false;
    setIsEditing(true);
  }

  function commit() {
    if (committedRef.current) return;
    committedRef.current = true;
    setIsEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== title) onSave(trimmed);
  }

  function discard() {
    committedRef.current = true;
    setIsEditing(false);
  }

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            discard();
          }
        }}
        className="block w-full truncate rounded-md border border-slate-300 px-2 py-0.5 text-xl font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      className="block w-full truncate rounded-md px-2 py-0.5 text-left text-xl font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30"
    >
      {title}
    </button>
  );
}
