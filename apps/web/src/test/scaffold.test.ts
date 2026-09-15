import { describe, expect, it } from 'vitest';

// Placeholder proving the Vitest `web` project (jsdom + fake-indexeddb) is wired correctly
// end to end (tasks/23-testing.md, step 3). Steps 5/8 replace this with real tests.
describe('vitest scaffolding', () => {
  it('runs in jsdom with IndexedDB available', () => {
    expect(typeof window).toBe('object');
    expect(typeof indexedDB).toBe('object');
  });
});
