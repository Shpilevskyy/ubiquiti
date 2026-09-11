import { arrayMove } from '@dnd-kit/sortable';

// Fractional-key positioning — see specs/08-drag-and-drop.md. Moving an item only ever needs to
// touch its own `position`: find where it lands among its (still-ordered) siblings, then average
// the neighbors on either side. Moving to an end just steps one past that end's sibling.
export function computeReorderPosition<T extends { id: string; position: number }>(
  siblings: T[],
  activeId: string,
  overId: string,
): number {
  const oldIndex = siblings.findIndex((s) => s.id === activeId);
  const overIndex = siblings.findIndex((s) => s.id === overId);
  const reordered = arrayMove(siblings, oldIndex, overIndex);
  const newIndex = reordered.findIndex((s) => s.id === activeId);
  const prev = reordered[newIndex - 1];
  const next = reordered[newIndex + 1];

  if (!prev) return next ? next.position - 1 : 0;
  if (!next) return prev.position + 1;
  // Known limitation (documented in the spec, not handled here): repeated insertions into the
  // same gap halve it each time, and the average could eventually lose float precision. The spec
  // calls this a rare-path safeguard, not the common case for this project's scope.
  return (prev.position + next.position) / 2;
}
