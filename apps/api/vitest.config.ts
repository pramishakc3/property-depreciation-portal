import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // API tests share one database, so run the files one after another
    fileParallelism: false,
    env: { NODE_ENV: 'test' },
  },
});
