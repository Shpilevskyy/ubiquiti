import { useRegisterSW } from 'virtual:pwa-register/react';

// registerType: 'prompt' (vite.config.ts) means a new service worker installs but waits — this
// is what surfaces it, rather than the app silently swapping the cached shell out from under an
// open tab (the exact hazard tasks/13 calls out for a stale shell talking to a newer API).
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg"
    >
      <span>A new version is available.</span>
      <button
        type="button"
        onClick={() => updateServiceWorker(true)}
        className="rounded bg-indigo-500 px-2 py-1 text-xs font-medium hover:bg-indigo-400"
      >
        Reload
      </button>
    </div>
  );
}
