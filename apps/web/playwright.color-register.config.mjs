import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.COLOR_REGISTER_RUNTIME_ROOT || !/^[a-f0-9]{40}$/.test(process.env.COLOR_REGISTER_EXPECTED_COMMIT ?? '')) {
  throw new Error('Provide the private isolated runtime directory and full immutable COLOR_REGISTER_EXPECTED_COMMIT.');
}
export default defineConfig({
  testDir: path.join(directory, 'e2e'),
  testMatch: 'color-register-local.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120000,
  expect: { timeout: 15000 },
  outputDir: path.join(process.env.COLOR_REGISTER_RUNTIME_ROOT, 'browser-results'),
  reporter: [['line'], ['html', { open: 'never', outputFolder: path.join(process.env.COLOR_REGISTER_RUNTIME_ROOT, 'browser-report') }]],
  use: {
    baseURL: 'http://127.0.0.1:3360',
    headless: true,
    trace: 'off', video: 'off', screenshot: 'only-on-failure',
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } } : {}),
  },
  // Never starts mock development services. Root must start the immutable isolated preview.
});
