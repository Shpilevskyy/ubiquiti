import type { Member } from '@ubiquiti-todo/shared';

// A per-browser-tab identity (not a user account) used to join realtime rooms and to let the
// server exclude this tab's own socket from the broadcast of its own mutations — see
// specs/04-realtime-protocol.md. Persisted in sessionStorage so it's stable across reloads of
// the same tab but distinct per tab, per specs/10-sharing-and-presence.md.
const STORAGE_KEY = 'ubiquiti-todo:member';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#6366f1', '#ec4899'];

function randomMember(): Member {
  return {
    id: crypto.randomUUID(),
    name: `Guest ${Math.floor(Math.random() * 1000)}`,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
}

export function getMember(): Member {
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored) return JSON.parse(stored) as Member;

  const member = randomMember();
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(member));
  return member;
}
