import { arrayMove } from '@dnd-kit/sortable';
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { describe, expect, it } from 'vitest';
import { comparePosition, computeReorderPosition } from './position';

interface Sib {
  id: string;
  position: string;
}

// Five siblings with real fractional-indexing keys (not hand-typed strings), in order — matches
// what `GET /api/lists` actually returns siblings sorted by.
function siblings(): Sib[] {
  const ids = ['A', 'B', 'C', 'D', 'E'];
  return generateNKeysBetween(null, null, ids.length).map((position, i) => ({
    id: ids[i],
    position,
  }));
}

describe('computeReorderPosition', () => {
  it('moves an item down (dragged over a later sibling)', () => {
    const sibs = siblings();
    // arrayMove removes A first, so C — originally two slots ahead — ends up one slot ahead of
    // where A lands; A's new neighbors are C (unchanged) and D (shifted left by the removal).
    const result = computeReorderPosition(sibs, 'A', 'C');
    expect(result).toBe(generateKeyBetween(sibs[2].position, sibs[3].position));
  });

  it('moves an item up (dragged over an earlier sibling) — not the mirror of moving down', () => {
    const sibs = siblings();
    // arrayMove inserts D at B's old index *before* removing shifts anything past it, so D's new
    // neighbors are A and B — the untouched pair below the drop target, not above it. This is the
    // asymmetry the source comment calls out: computing against the *original* array here (using
    // A/B directly) would be wrong.
    const result = computeReorderPosition(sibs, 'D', 'B');
    expect(result).toBe(generateKeyBetween(sibs[0].position, sibs[1].position));
  });

  it('moves an item to the top — prev is undefined, generator gets null', () => {
    const sibs = siblings();
    const result = computeReorderPosition(sibs, 'C', 'A');
    expect(result).toBe(generateKeyBetween(null, sibs[0].position));
  });

  it('moves an item to the bottom — next is undefined, generator gets null', () => {
    const sibs = siblings();
    const result = computeReorderPosition(sibs, 'B', 'E');
    expect(result).toBe(generateKeyBetween(sibs[4].position, null));
  });

  it('handles a single-item list (both neighbors null)', () => {
    const sibs: Sib[] = [{ id: 'only', position: 'a0' }];
    const result = computeReorderPosition(sibs, 'only', 'only');
    expect(result).toBe(generateKeyBetween(null, null));
  });

  it('drop-on-self recomputes a key between the item’s existing neighbors', () => {
    const sibs = siblings();
    // Not a no-op: arrayMove(i, i) is the identity permutation, so this generates a *new* key
    // between C's current neighbors (B and D) rather than returning C's existing position.
    const result = computeReorderPosition(sibs, 'C', 'C');
    expect(result).toBe(generateKeyBetween(sibs[1].position, sibs[3].position));
  });

  it('an unknown activeId silently relocates the last sibling instead of throwing', () => {
    const sibs = siblings();
    // findIndex returns -1 for a stale/unknown id, twice over: once for `oldIndex`, which
    // arrayMove's internal `newArray.splice(from, 1)` interprets as "remove the *last* element"
    // (so the last sibling, E, is what actually gets relocated to `overId`'s slot) — and again for
    // `newIndex` afterward, since the unknown id still isn't found in the *reordered* array
    // either. That second -1 means `prev` is always out of bounds (undefined → null) and `next`
    // is always the reordered array's first element, regardless of where `overId` pointed. Pinned
    // directly against a hand-computed `arrayMove` call, not reasoned about, and not asserted to
    // be desirable — probably unreachable today, since dnd-kit only ever supplies ids it rendered.
    const overIndex = sibs.findIndex((s) => s.id === 'A');
    const reordered = arrayMove(sibs, -1, overIndex);
    const result = computeReorderPosition(sibs, 'does-not-exist', 'A');
    expect(result).toBe(generateKeyBetween(null, reordered[0].position));
  });
});

describe('comparePosition', () => {
  it('orders by plain byte value', () => {
    expect(comparePosition({ position: 'a0' }, { position: 'a1' })).toBeLessThan(0);
    expect(comparePosition({ position: 'a1' }, { position: 'a0' })).toBeGreaterThan(0);
    expect(comparePosition({ position: 'a0' }, { position: 'a0' })).toBe(0);
  });

  it('does not agree with localeCompare on mixed-case pairs (the whole point of not using it)', () => {
    // Same pairs noted in PROGRESS.md's tasks/18 entry. COLLATE "C" is plain byte order, where
    // every uppercase letter sorts before every lowercase one ('A' = 0x41 < 'a' = 0x61) — locale
    // collation instead treats case as a secondary weight after the base letter, and disagrees on
    // both pairs below. Asserting against the sign of localeCompare itself (not a hard-coded
    // expectation) is what proves the disagreement, not just documents it.
    const pairs: [string, string][] = [
      ['Ab', 'aA'],
      ['aa', 'AB'],
    ];
    for (const [a, b] of pairs) {
      const byteOrderSign = Math.sign(comparePosition({ position: a }, { position: b }));
      const localeSign = Math.sign(a.localeCompare(b));
      expect(byteOrderSign).not.toBe(0);
      expect(byteOrderSign).not.toBe(localeSign);
    }
  });
});
