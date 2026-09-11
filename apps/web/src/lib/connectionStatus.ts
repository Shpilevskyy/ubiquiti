type Status = 'online' | 'offline';
type Listener = () => void;

// A single global signal for "can we probably reach our server" — navigator.onLine alone only
// reflects link-layer state, not server reachability (specs/06-offline-sync.md). Fed from three
// places: Socket.IO connect/disconnect (wired in useListSocket, where the app's socket lives),
// the browser's online/offline events (belt and braces — either can fire first), and a failed
// fetch marking offline immediately rather than waiting for a browser event (wired in api.ts).
let status: Status = typeof navigator === 'undefined' || navigator.onLine !== false ? 'online' : 'offline';
const listeners = new Set<Listener>();

function setStatus(next: Status) {
  if (next === status) return;
  status = next;
  listeners.forEach((listener) => listener());
}

export const connectionStatus = {
  getStatus: () => status,
  markOnline: () => setStatus('online'),
  markOffline: () => setStatus('offline'),
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', connectionStatus.markOnline);
  window.addEventListener('offline', connectionStatus.markOffline);
}
