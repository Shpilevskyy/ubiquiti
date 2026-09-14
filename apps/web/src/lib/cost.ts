import { COST_CENTS_MAX, type Todo } from '@ubiquiti-todo/shared';

export function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

// Strips currency symbols/thousands separators and rounds to the nearest cent so the result is
// always a valid integer for costCents (UpdateTodoBodySchema/UpdateSubTaskBodySchema 400 on a
// float). Returns `null` for an intentionally cleared field, `undefined` for input that isn't a
// non-negative number at all (never sent — see CostInput).
//
// The COST_CENTS_MAX check keeps this in step with the shared schema's own bound rather than
// leaving the server to reject what this happily produced: an eight-digit dollar amount is easy
// enough to type, and sending it earned a 400 whose only visible result was a delayed "could not
// be saved" toast. Refused here, it's the same immediate silent revert as any other unusable
// input, with no round trip to explain.
export function parseCostInput(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const cleaned = trimmed.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return undefined;
  const cents = Math.round(Number(cleaned) * 100);
  return cents > COST_CENTS_MAX ? undefined : cents;
}

// Rollup semantics (PROGRESS.md Decisions, tasks/01): a todo's own cost and its subtasks' costs
// are surfaced separately rather than summed into the parent, so neither is silently hidden.
export function subtaskSubtotalCents(todo: Todo): number {
  return todo.subtasks.reduce((sum, subtask) => sum + (subtask.costCents ?? 0), 0);
}

export function listTotalCents(todos: Todo[]): number {
  return todos.reduce((sum, todo) => sum + (todo.costCents ?? 0) + subtaskSubtotalCents(todo), 0);
}
