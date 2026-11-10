import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '../..');
const resultRound = process.env.PLAYWRIGHT_RESULT_ROUND ?? 'r20';
const resultRoot = `../../test-results/${resultRound}`;
const browserExecutablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const disableVideo = process.env.PLAYWRIGHT_DISABLE_VIDEO === '1';
const nativeTable = process.env.PLAYWRIGHT_NATIVE_TABLE === '1';
const isR26Gate1 = process.argv.some((argument) =>
  argument.includes('r26-gate1-static-v2'),
);

const apiServer = {
  command: 'pnpm --filter @feishu-timeline/api dev',
  url: 'http://localhost:3001/api/health',
  reuseExistingServer: !nativeTable,
  timeout: 180_000,
  cwd: repoRoot,
  env: {
    AUTH_MOCK_ENABLED: nativeTable ? 'false' : 'true',
    NOTIFICATION_QUEUE_ENABLED: 'false',
  },
};

const webServer = {
  command: 'pnpm --filter @feishu-timeline/web dev',
  url: isR26Gate1 ? 'http://localhost:3000/v2/dashboard' : 'http://localhost:3000/login',
  reuseExistingServer: !nativeTable,
  timeout: 180_000,
  cwd: repoRoot,
  env: {
    NEXT_PUBLIC_ENABLE_MOCK_LOGIN: nativeTable ? 'false' : 'true',
    NEXT_PUBLIC_R26_V2_PROTOTYPE: nativeTable ? 'false' : 'true',
    NEXT_PUBLIC_R26_V2_DATA_MODE: nativeTable ? 'api' : 'fixture',
  },
};

export default defineConfig({
  testDir: '.',
  testMatch: nativeTable ? ['tests/native/native-table-ci.spec.ts'] : ['tests/playwright/**/*.spec.ts', 'e2e/**/*.spec.ts'],
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  retries: nativeTable ? 0 : process.env.CI ? 1 : 0,
  reporter: nativeTable ? [['line']] : [
    ['line'],
    ['html', { open: 'never', outputFolder: `${resultRoot}/reports/playwright-report` }],
  ],
  outputDir: `${resultRoot}/traces`,
  use: {
    ...(nativeTable ? { actionTimeout: 15_000, navigationTimeout: 45_000 } : {}),
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    ...(browserExecutablePath ? { launchOptions: { executablePath: browserExecutablePath } } : {}),
    ...(process.env.PLAYWRIGHT_STORAGE_STATE
      ? { storageState: process.env.PLAYWRIGHT_STORAGE_STATE }
      : {}),
    trace: nativeTable ? 'off' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: nativeTable || disableVideo ? 'off' : 'retain-on-failure',
    headless: true,
  },
  webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVER === '1'
    ? undefined
    : [apiServer, webServer],
});
