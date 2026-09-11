import type { Member } from '@ubiquiti-todo/shared';

interface JoinedSocket {
  listId: string;
  member: Member;
}

// In-memory only, per specs/04-realtime-protocol.md#presence-data-lifetime — resets on restart,
// which is fine since clients re-join on reconnect.
export class PresenceStore {
  private membersByList = new Map<string, Map<string, Member>>();
  private socketsByMember = new Map<string, Set<string>>();
  private joinedSocket = new Map<string, JoinedSocket>();

  join(socketId: string, listId: string, member: Member): Member[] {
    this.leave(socketId);

    if (!this.membersByList.has(listId)) {
      this.membersByList.set(listId, new Map());
    }
    this.membersByList.get(listId)!.set(member.id, member);

    if (!this.socketsByMember.has(member.id)) {
      this.socketsByMember.set(member.id, new Set());
    }
    this.socketsByMember.get(member.id)!.add(socketId);

    this.joinedSocket.set(socketId, { listId, member });
    return this.getMembers(listId);
  }

  // Returns the listId the socket was in, if any, so the caller can broadcast the updated
  // presence list — or undefined if the socket had not joined a list.
  leave(socketId: string): string | undefined {
    const joined = this.joinedSocket.get(socketId);
    if (!joined) return undefined;
    this.joinedSocket.delete(socketId);

    const { listId, member } = joined;
    const sockets = this.socketsByMember.get(member.id);
    sockets?.delete(socketId);
    if (!sockets || sockets.size === 0) {
      this.socketsByMember.delete(member.id);
      this.membersByList.get(listId)?.delete(member.id);
    }
    return listId;
  }

  getMembers(listId: string): Member[] {
    return [...(this.membersByList.get(listId)?.values() ?? [])];
  }

  // Socket ids belonging to a given member, so a REST-triggered broadcast can exclude the
  // client that made the mutation — see specs/04-realtime-protocol.md#connecting-...
  getSocketIds(memberId: string): string[] {
    return [...(this.socketsByMember.get(memberId) ?? [])];
  }
}
