import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['eval/chat/11-evidence-loop/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
