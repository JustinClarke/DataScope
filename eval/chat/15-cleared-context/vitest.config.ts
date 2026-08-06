import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['eval/chat/15-cleared-context/*.test.ts'],
    fileParallelism: false,
  },
});
