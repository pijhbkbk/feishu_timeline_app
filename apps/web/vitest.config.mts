import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'tests/playwright/**',
      'playwright.config.*',
      'scripts/playwright-runner.mjs',
    ],
  },
});
