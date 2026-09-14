// specs/05-sync-conflict-resolution.md's stale-write indicator.
//
// A conflict is "the value you overwrote was not the value you last saw" — compared per field,
// because a PATCH only writes the fields it names. The row's `version` column deliberately isn't
// used here: it advances on *any* write to the row, so comparing it would report a conflict when
// someone edited a different field and nothing was actually lost.
//
// Soft signal only. The write always applies (whole-record LWW is the specced rule); this just
// decides whether to tell the client its write landed on top of someone else's.
export function detectConflict<T extends object>(
  current: T,
  base: Partial<T> | undefined,
): boolean {
  if (!base) return false;
  return Object.entries(base).some(([field, seen]) => current[field as keyof T] !== seen);
}
