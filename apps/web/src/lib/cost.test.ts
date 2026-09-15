import { COST_CENTS_MAX, type SubTask, type Todo } from '@ubiquiti-todo/shared';
import { describe, expect, it } from 'vitest';
import { listTotalCents, parseCostInput, subtaskSubtotalCents } from './cost';

function makeSubTask(overrides: Partial<SubTask> = {}): SubTask {
  return {
    id: 'sub-1',
    todoId: 'todo-1',
    title: 'subtask',
    done: false,
    position: 'a0',
    costCents: null,
    version: 1,
    createdAt: '2026-09-15T00:00:00.000Z',
    updatedAt: '2026-09-15T00:00:00.000Z',
    ...overrides,
  };
}

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'todo-1',
    listId: 'list-1',
    title: 'todo',
    done: false,
    position: 'a0',
    costCents: null,
    descriptionMd: null,
    version: 1,
    createdAt: '2026-09-15T00:00:00.000Z',
    updatedAt: '2026-09-15T00:00:00.000Z',
    subtasks: [],
    ...overrides,
  };
}

describe('parseCostInput', () => {
  it('returns null for an intentionally cleared field, not undefined', () => {
    // null ("send this, clear the cost") and undefined ("don't send anything") are different
    // instructions to the caller — collapsing them would either stop clearing from working or
    // start sending 400-triggering garbage on every non-numeric keystroke.
    expect(parseCostInput('')).toBeNull();
    expect(parseCostInput('   ')).toBeNull();
  });

  it('returns undefined for input that is never a usable number', () => {
    expect(parseCostInput('abc')).toBeUndefined();
    expect(parseCostInput('-5')).toBeUndefined();
    expect(parseCostInput('1.2.3')).toBeUndefined();
    expect(parseCostInput('12abc')).toBeUndefined();
  });

  it('strips currency symbols, thousands separators, and whitespace', () => {
    expect(parseCostInput('$12.50')).toBe(1250);
    expect(parseCostInput('1,234.50')).toBe(123450);
    expect(parseCostInput('  9.00  ')).toBe(900);
  });

  it('rounds to the nearest whole cent', () => {
    // The exact PROGRESS.md example: 4.999 dollars should not become a non-integer costCents,
    // which the shared schema (z.number().int()) would 400 on.
    expect(parseCostInput('4.999')).toBe(500);
    expect(parseCostInput('4.001')).toBe(400);
  });

  it('accepts exactly COST_CENTS_MAX but refuses one cent over it', () => {
    const maxDollars = (COST_CENTS_MAX / 100).toFixed(2);
    expect(parseCostInput(maxDollars)).toBe(COST_CENTS_MAX);

    const overMax = ((COST_CENTS_MAX + 1) / 100).toFixed(2);
    expect(parseCostInput(overMax)).toBeUndefined();
  });

  it('accepts a bare integer with no decimal point', () => {
    expect(parseCostInput('5')).toBe(500);
  });
});

describe('subtaskSubtotalCents', () => {
  it('is 0 when there are no subtasks or none are priced', () => {
    expect(subtaskSubtotalCents(makeTodo())).toBe(0);
    expect(
      subtaskSubtotalCents(
        makeTodo({
          subtasks: [makeSubTask({ costCents: null }), makeSubTask({ costCents: null })],
        }),
      ),
    ).toBe(0);
  });

  it('sums only the priced subtasks, skipping null costs', () => {
    const todo = makeTodo({
      subtasks: [
        makeSubTask({ id: 's1', costCents: 500 }),
        makeSubTask({ id: 's2', costCents: null }),
        makeSubTask({ id: 's3', costCents: 250 }),
      ],
    });
    expect(subtaskSubtotalCents(todo)).toBe(750);
  });
});

describe('listTotalCents', () => {
  it('sums every todo’s own cost and every subtask’s cost, without double-counting', () => {
    const todos: Todo[] = [
      makeTodo({
        id: 't1',
        costCents: 1000,
        subtasks: [makeSubTask({ id: 's1', costCents: 300 })],
      }),
      makeTodo({
        id: 't2',
        costCents: null,
        subtasks: [
          makeSubTask({ id: 's2', costCents: 200 }),
          makeSubTask({ id: 's3', costCents: null }),
        ],
      }),
    ];
    // 1000 (t1) + 300 (t1's subtask) + 0 (t2 has no own cost) + 200 (t2's priced subtask).
    expect(listTotalCents(todos)).toBe(1500);
  });

  it('is 0 for an empty list or a list with nothing priced', () => {
    expect(listTotalCents([])).toBe(0);
    expect(listTotalCents([makeTodo(), makeTodo({ id: 't2' })])).toBe(0);
  });
});
