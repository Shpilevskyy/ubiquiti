// Every web test needs a working IndexedDB — outbox.ts (idb-keyval) has no in-memory fallback,
// and jsdom doesn't implement IndexedDB at all. Installed globally here rather than per-test so
// tests don't have to remember it (tasks/23-testing.md).
import 'fake-indexeddb/auto';

// Extends `expect` with `.toBeInTheDocument()`/`.toBeEmptyDOMElement()`/etc. and their TS types —
// the standard DOM-assertion companion to @testing-library/react (step 8, component tests). Not
// mentioned by name in tasks/23's Tooling table, but implied by "@testing-library/react"; without
// it, every assertion would fall back to raw `.textContent`/`.className` checks.
import '@testing-library/jest-dom/vitest';

// @testing-library/react's own auto-cleanup only self-registers against a *global* afterEach
// (e.g. with `test.globals: true`); this project imports `afterEach` per-file instead, so nothing
// would otherwise unmount a rendered component between tests — the next render() would pile up
// alongside it in the same jsdom document (step 8, component tests).
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
