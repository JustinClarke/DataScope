import { defineConfig } from 'vitest/config'

// Stores are unit-testable without a DOM (01-foundation/02-state-management.md
// acceptance criteria) except the settings persistence test, which needs a real
// `localStorage`. jsdom under an opaque origin exposes none, so `src/test/setup.ts`
// installs a spec-faithful in-memory Storage before any test runs.
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'edge/**/*.test.ts'],
  },
})
