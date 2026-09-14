import { useEffect, useRef, useState } from 'react';
import { formatCents, parseCostInput } from '../lib/cost';

interface CostInputProps {
  costCents: number | null;
  onSave: (costCents: number | null) => void;
}

// Click-to-edit, mirroring TodoDescription's edit/view toggle (specs/09). Commits on blur and on
// Enter; Escape discards with no save. Unparseable input (non-numeric, negative, garbage like
// "abc"/"-5") is silently discarded rather than sent — costCents must stay a non-negative integer
// or the server 400s.
export function CostInput({ costCents, onSave }: CostInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  function startEditing() {
    setDraft(costCents === null ? '' : (costCents / 100).toFixed(2));
    committedRef.current = false;
    setIsEditing(true);
  }

  function commit() {
    if (committedRef.current) return;
    committedRef.current = true;
    setIsEditing(false);
    const parsed = parseCostInput(draft);
    if (parsed === undefined) return;
    if (parsed !== costCents) onSave(parsed);
  }

  function discard() {
    committedRef.current = true;
    setIsEditing(false);
  }

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
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
        placeholder="0.00"
        inputMode="decimal"
        className="w-20 rounded-md border border-slate-200 px-1.5 py-0.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
      />
    );
  }

  return (
    // A <span role="button"> rather than a real <button>, matching TodoDescription's click-to-edit
    // trigger (tasks/16-accessibility.md): this sits inline in a row of other controls, and a real
    // <button>'s default box/border styling would need overriding anyway.
    // biome-ignore lint/a11y/useSemanticElements: see comment above.
    <span
      role="button"
      tabIndex={0}
      onClick={startEditing}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          startEditing();
        }
      }}
      className="cursor-text rounded-md px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30"
    >
      {costCents === null ? <span className="text-slate-400">Add cost…</span> : formatCents(costCents)}
    </span>
  );
}
