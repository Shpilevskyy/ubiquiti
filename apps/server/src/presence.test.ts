import { describe, expect, it } from 'vitest';
import { PresenceStore } from './presence.js';

const alice = { id: 'member-alice', name: 'Alice', color: '#111' };
const bob = { id: 'member-bob', name: 'Bob', color: '#222' };

describe('PresenceStore', () => {
  it('keeps a member present while any of their sockets is still joined', () => {
    const presence = new PresenceStore();
    presence.join('socket-1', 'list-a', alice);
    presence.join('socket-2', 'list-a', alice); // e.g. two browser tabs for the same member

    presence.leave('socket-1');
    expect(presence.getMembers('list-a')).toEqual([alice]);
    expect(presence.getSocketIds(alice.id)).toEqual(['socket-2']);

    presence.leave('socket-2');
    expect(presence.getMembers('list-a')).toEqual([]);
    expect(presence.getSocketIds(alice.id)).toEqual([]);
  });

  it('re-joining an already-joined socket does not duplicate or orphan it', () => {
    const presence = new PresenceStore();
    presence.join('socket-1', 'list-a', alice);
    // Same socket re-joins the same list (e.g. a reconnect that replays list:join).
    presence.join('socket-1', 'list-a', alice);

    expect(presence.getMembers('list-a')).toEqual([alice]);
    expect(presence.getSocketIds(alice.id)).toEqual(['socket-1']);

    // A single leave() fully removes it — no orphaned second registration left behind.
    presence.leave('socket-1');
    expect(presence.getMembers('list-a')).toEqual([]);
  });

  it('re-joining under a different list moves the socket, not copies it', () => {
    const presence = new PresenceStore();
    presence.join('socket-1', 'list-a', alice);
    // join() calls leave() first, so switching lists on the same socket must remove it from the
    // old list's members rather than leaving it present on both.
    const membersOfNewList = presence.join('socket-1', 'list-b', alice);

    expect(membersOfNewList).toEqual([alice]);
    expect(presence.getMembers('list-a')).toEqual([]);
    expect(presence.getMembers('list-b')).toEqual([alice]);
  });

  it('leave on an unknown socket returns undefined and changes nothing', () => {
    const presence = new PresenceStore();
    presence.join('socket-1', 'list-a', alice);

    expect(presence.leave('never-joined')).toBeUndefined();
    expect(presence.getMembers('list-a')).toEqual([alice]);
  });

  it('leave returns the listId the socket was in, for the caller to re-broadcast', () => {
    const presence = new PresenceStore();
    presence.join('socket-1', 'list-a', alice);
    expect(presence.leave('socket-1')).toBe('list-a');
  });

  it('getSocketIds only returns sockets for that member, across multiple members/lists', () => {
    const presence = new PresenceStore();
    presence.join('socket-alice-1', 'list-a', alice);
    presence.join('socket-alice-2', 'list-a', alice);
    presence.join('socket-bob-1', 'list-a', bob);

    expect(presence.getSocketIds(alice.id).sort()).toEqual(['socket-alice-1', 'socket-alice-2']);
    expect(presence.getSocketIds(bob.id)).toEqual(['socket-bob-1']);
    expect(presence.getSocketIds('member-nobody')).toEqual([]);
  });

  it('getMembers only returns members currently present on that list', () => {
    const presence = new PresenceStore();
    presence.join('socket-1', 'list-a', alice);
    presence.join('socket-2', 'list-b', bob);

    expect(presence.getMembers('list-a')).toEqual([alice]);
    expect(presence.getMembers('list-b')).toEqual([bob]);
    expect(presence.getMembers('list-c')).toEqual([]);
  });
});
