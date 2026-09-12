import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface TodoDescriptionProps {
  descriptionMd: string | null;
  onSave: (descriptionMd: string) => void;
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

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
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
    <div
      onClick={startEditing}
      className="mt-1 cursor-text rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 [&_a]:text-indigo-600 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-2 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_:is(h1,h2)]:mb-1 [&_:is(h1,h2)]:text-sm [&_:is(h1,h2)]:font-semibold [&_:is(h1,h2)]:text-slate-900 [&_:is(h3,h4,h5,h6)]:mb-1 [&_:is(h3,h4,h5,h6)]:font-semibold [&_:is(h3,h4,h5,h6)]:text-slate-900 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:mb-1 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4"
    >
      {descriptionMd ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{descriptionMd}</ReactMarkdown>
      ) : (
        <span className="text-slate-400">Add a description…</span>
      )}
    </div>
  );
}
