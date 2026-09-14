import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface TodoDescriptionProps {
  descriptionMd: string | null;
  onSave: (descriptionMd: string) => void;
}

function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

// specs/09-markdown-descriptions.md's edit/view toggle. Deliberately doesn't sync `draft` from
// `descriptionMd` while editing — only when entering edit mode — so a realtime update landing
// mid-edit doesn't overwrite what the user is typing; view mode always reads `descriptionMd`
// directly, so it picks up the latest value as soon as editing ends.
export function TodoDescription({ descriptionMd, onSave }: TodoDescriptionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const committedRef = useRef(false);

  function startEditing() {
    setDraft(descriptionMd ?? '');
    committedRef.current = false;
    setIsEditing(true);
  }

  function commit() {
    if (committedRef.current) return;
    committedRef.current = true;
    setIsEditing(false);
    if (draft !== (descriptionMd ?? '')) onSave(draft);
  }

  function discard() {
    committedRef.current = true;
    setIsEditing(false);
  }

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      autoGrow(textareaRef.current);
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          autoGrow(event.target);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            discard();
          }
        }}
        rows={2}
        className="mt-1 w-full resize-none rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
      />
    );
  }

  return (
    // A <div role="button"> rather than a real <button>, per tasks/16-accessibility.md: the
    // rendered markdown can contain block content (headings, lists, tables), which a <button>
    // can't legally contain.
    // biome-ignore lint/a11y/useSemanticElements: see comment above.
    <div
      role="button"
      tabIndex={0}
      onClick={startEditing}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          startEditing();
        }
      }}
      className="prose prose-sm prose-slate mt-1 max-w-none cursor-text rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 prose-headings:my-1 prose-headings:text-xs prose-headings:font-semibold prose-h1:text-sm prose-h2:text-sm prose-p:my-1 prose-blockquote:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-table:my-1 prose-hr:my-2"
    >
      {descriptionMd ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{descriptionMd}</ReactMarkdown>
      ) : (
        <span className="text-slate-400">Add a description…</span>
      )}
    </div>
  );
}
