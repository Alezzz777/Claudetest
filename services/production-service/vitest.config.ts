import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
    // Exclude NestJS boilerplate that requires full DI resolution
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
