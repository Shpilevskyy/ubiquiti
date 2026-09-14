interface SubtaskProgressProps {
  done: number;
  total: number;
}

// specs/11-testing-strategy.md's planned SubtaskProgress: a quiet done/total indicator, deriving
// purely from props (todo.subtasks is already in the cache and already updates from both
// optimistic writes and realtime broadcasts, so this needs no state or query of its own).
export function SubtaskProgress({ done, total }: SubtaskProgressProps) {
  if (total === 0) return null;

  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-400">
      <span className="h-1 w-8 overflow-hidden rounded-full bg-slate-200">
        <span
          className="block h-full rounded-full bg-indigo-400"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </span>
      {done}/{total}
    </span>
  );
}
