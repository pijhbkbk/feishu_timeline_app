import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '../..');

export default defineConfig({
  testDir: './tests/playwright',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['line'],
    ['html', { open: 'never', outputFolder: './playwright-report' }],
  ],
  outputDir: './test-results/playwright',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  webServer: [
    {
      command: 'pnpm --filter @feishu-timeline/api dev',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: true,
      timeout: 180_000,
      cwd: repoRoot,
    },
    {
      command: 'pnpm --filter @feishu-timeline/web dev',
      url: 'http://localhost:3000/login',
      reuseExistingServer: true,
      timeout: 180_000,
      cwd: repoRoot,
    },
  ],
});
