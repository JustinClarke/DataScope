import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['eval/chat/12-verified-claims/*.test.ts'],
    fileParallelism: false,
  },
});
