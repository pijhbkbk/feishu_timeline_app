import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '../..');
const resultRound = process.env.PLAYWRIGHT_RESULT_ROUND ?? 'r20';
const resultRoot = `../../test-results/${resultRound}`;

export default defineConfig({
  testDir: '.',
  testMatch: ['tests/playwright/**/*.spec.ts', 'e2e/**/*.spec.ts'],
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['line'],
    ['html', { open: 'never', outputFolder: `${resultRoot}/reports/playwright-report` }],
  ],
  outputDir: `${resultRoot}/traces`,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    ...(process.env.PLAYWRIGHT_STORAGE_STATE
      ? { storageState: process.env.PLAYWRIGHT_STORAGE_STATE }
      : {}),
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
      env: {
        AUTH_MOCK_ENABLED: 'true',
        NOTIFICATION_QUEUE_ENABLED: 'false',
      },
    },
    {
      command: 'pnpm --filter @feishu-timeline/web dev',
      url: 'http://localhost:3000/login',
      reuseExistingServer: true,
      timeout: 180_000,
      cwd: repoRoot,
      env: {
        NEXT_PUBLIC_ENABLE_MOCK_LOGIN: 'true',
      },
    },
  ],
});
