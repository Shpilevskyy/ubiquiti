import { describe, expect, it } from 'vitest';
import { detectConflict } from './conflict.js';

interface Row {
  title: string;
  done: boolean;
  costCents: number | null;
}

const current: Row = { title: 'Buy milk', done: false, costCents: 500 };

describe('detectConflict', () => {
  it('reports no conflict when base is undefined (client sent no baseline)', () => {
    expect(detectConflict(current, undefined)).toBe(false);
  });

  it('reports no conflict when every base field matches the current row', () => {
    expect(detectConflict(current, { title: 'Buy milk', done: false })).toBe(false);
  });

  it('reports a conflict when a base field disagrees with the current row', () => {
    expect(detectConflict(current, { title: 'Buy oat milk' })).toBe(true);
  });

  // The regression this function was rewritten to fix (PROGRESS.md, 2026-09-14): the old
  // row-`version`-based check reported a conflict for *any* concurrent edit to the row, including
  // a field this write never touched — so two people editing different fields of the same todo
  // both saw "also edited elsewhere" despite neither losing an edit. Per-field comparison must not
  // regress back to that.
  it('reports no conflict when the concurrent edit touched a different field', () => {
    // `current.costCents` changed from what the client last saw (500 -> updated elsewhere to
    // 900, say), but this write's `base` only names `title`/`done`, which are unchanged.
    const rowWithChangedCost: Row = { ...current, costCents: 900 };
    expect(detectConflict(rowWithChangedCost, { title: 'Buy milk', done: false })).toBe(false);
  });

  it('reports a conflict if any one of several base fields disagrees', () => {
    expect(detectConflict(current, { title: 'Buy milk', done: true })).toBe(true);
  });

  it('reports no conflict for an empty base object', () => {
    expect(detectConflict(current, {})).toBe(false);
  });
});
