import { arrayMove } from '@dnd-kit/sortable';
import { generateKeyBetween } from 'fractional-indexing';

// String fractional indexing (specs/08-drag-and-drop.md, tasks/18) — lexicographically ordered
// keys that never run out of room between two neighbors, unlike averaging floats. Moving an item
// only ever needs to touch its own `position`: find where it lands among its (still-ordered)
// siblings, then generate a key between the neighbors on either side. Moving to an end just
// passes `null` for the missing bound.
export function computeReorderPosition<T extends { id: string; position: string }>(
  siblings: T[],
  activeId: string,
  overId: string,
): string {
  const oldIndex = siblings.findIndex((s) => s.id === activeId);
  const overIndex = siblings.findIndex((s) => s.id === overId);
  const reordered = arrayMove(siblings, oldIndex, overIndex);
  const newIndex = reordered.findIndex((s) => s.id === activeId);
  const prev = reordered[newIndex - 1];
  const next = reordered[newIndex + 1];

  return generateKeyBetween(prev?.position ?? null, next?.position ?? null);
}

// Byte-order comparison, matching the DB's `COLLATE "C"` on this column (tasks/18) — deliberately
// not `localeCompare`, which applies locale rules (case/punctuation as secondary weights) that can
// disagree with the plain `<`/`>` ordering the key generator and the database both intend.
export function comparePosition(a: { position: string }, b: { position: string }): number {
  if (a.position < b.position) return -1;
  if (a.position > b.position) return 1;
  return 0;
}
