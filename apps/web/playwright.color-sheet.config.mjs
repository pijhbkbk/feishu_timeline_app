import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.COLOR_SHEET_EVIDENCE_ROOT || !process.env.COLOR_SHEET_FIXTURE_FILE || !process.env.COLOR_SHEET_ACCOUNTS_FILE || !/^[a-f0-9]{40}$/.test(process.env.COLOR_SHEET_EXPECTED_COMMIT ?? '')) {
  throw new Error('Provide explicit private evidence, fixture and account files plus the immutable full runtime commit.');
}
export default defineConfig({
  testDir: path.join(directory, 'e2e'), testMatch: 'color-sheet-local.spec.ts', fullyParallel: false, workers: 1, retries: 0,
  timeout: 240000, expect: { timeout: 20000 },
  outputDir: path.join(process.env.COLOR_SHEET_EVIDENCE_ROOT, 'results'),
  reporter: [['line'], ['html', { open: 'never', outputFolder: path.join(process.env.COLOR_SHEET_EVIDENCE_ROOT, 'report') }]],
  use: {
    baseURL: 'http://127.0.0.1:3370', viewport: { width: 1440, height: 900 },
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai', headless: true,
    actionTimeout: 20000, navigationTimeout: 45000,
    trace: 'off', video: 'off', screenshot: 'only-on-failure',
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } } : {}),
  },
  // Intentionally no webServer: never replace or stop the existing 3360 runtime.
});
