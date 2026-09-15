import { describe, expect, it } from 'vitest';

// Placeholder proving the Vitest `server` project (node environment) is wired correctly
// end to end (tasks/23-testing.md, step 3). Step 4 replaces this with real unit tests.
describe('vitest scaffolding', () => {
  it('runs in the node environment', () => {
    // No `window` DOM lib here (unlike the `web` project's jsdom environment) — checked via `in`
    // rather than `typeof window` so this compiles under the server's DOM-less tsconfig lib.
    expect('window' in globalThis).toBe(false);
  });
});
