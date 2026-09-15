// Every web test needs a working IndexedDB — outbox.ts (idb-keyval) has no in-memory fallback,
// and jsdom doesn't implement IndexedDB at all. Installed globally here rather than per-test so
// tests don't have to remember it (tasks/23-testing.md).
import 'fake-indexeddb/auto';
