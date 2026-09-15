import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Absolute, not './apps/server' — a project's `root` here is resolved against the *process's*
// cwd, not this file's directory, so a relative path breaks the per-workspace `npm run test -w
// ...` scripts (tasks/23-testing.md step 3's "per-workspace invocation should also work").
function repoPath(relative: string) {
  return fileURLToPath(new URL(relative, import.meta.url));
}

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'server',
          root: repoPath('./apps/server'),
          environment: 'node',
          include: ['src/**/*.test.ts'],
          // The route handlers wrap their read + write in prisma.$transaction (tasks/04), so the
          // usual "wrap each test in a transaction and roll it back" isolation trick doesn't work
          // here. Step 6's integration tests instead TRUNCATE a shared test database in
          // beforeEach, which is only safe if test files never run concurrently against it — see
          // tasks/23-testing.md's Hazards section.
          fileParallelism: false,
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'web',
          root: repoPath('./apps/web'),
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          // connectionStatus.ts/outboxSync.ts hold module-level state set up as an import side
          // effect; tests reset it per-test with vi.resetModules() + dynamic import() rather than
          // a global setup hook (tasks/23-testing.md's Hazards section) — this file only installs
          // fake-indexeddb, which every web test needs regardless.
          setupFiles: ['./src/test/setup.ts'],
        },
      },
    ],
  },
});
