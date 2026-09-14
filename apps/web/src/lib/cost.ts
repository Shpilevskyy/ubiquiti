import type { Todo } from '@ubiquiti-todo/shared';

export function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

// Strips currency symbols/thousands separators and rounds to the nearest cent so the result is
// always a valid integer for costCents (UpdateTodoBodySchema/UpdateSubTaskBodySchema 400 on a
// float). Returns `null` for an intentionally cleared field, `undefined` for input that isn't a
// non-negative number at all (never sent — see CostInput).
export function parseCostInput(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const cleaned = trimmed.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return undefined;
  return Math.round(Number(cleaned) * 100);
}

// Rollup semantics (PROGRESS.md Decisions, tasks/01): a todo's own cost and its subtasks' costs
// are surfaced separately rather than summed into the parent, so neither is silently hidden.
export function subtaskSubtotalCents(todo: Todo): number {
  return todo.subtasks.reduce((sum, subtask) => sum + (subtask.costCents ?? 0), 0);
}

export function listTotalCents(todos: Todo[]): number {
  return todos.reduce((sum, todo) => sum + (todo.costCents ?? 0) + subtaskSubtotalCents(todo), 0);
}
