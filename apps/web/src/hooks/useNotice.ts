import { useEffect, useRef, useState } from 'react';

const NOTICE_DURATION_MS = 4000;

// A second notice arriving before the first's duration elapsed used to be cut short by the first
// notice's own stale timer (no handle was kept, so nothing cleared it) — tasks/06. Keeping the
// handle and clearing it before scheduling a new one means each notice always gets its full
// duration; the effect below also clears it on unmount.
export function useNotice() {
  const [notice, setNotice] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showNotice = (message: string) => {
    clearTimeout(timeoutRef.current);
    setNotice(message);
    timeoutRef.current = window.setTimeout(() => setNotice(null), NOTICE_DURATION_MS);
  };

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return { notice, showNotice, dismissNotice: () => setNotice(null) };
}
