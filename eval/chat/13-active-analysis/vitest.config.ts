import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['eval/chat/13-active-analysis/*.test.ts'],
    fileParallelism: false,
  },
});
