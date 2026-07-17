import { chmod, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const requireFromWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { chromium } = requireFromWeb('@playwright/test');

const sessionDir = await validateSessionDir(process.env.R23_SESSION_DIR);
const baseUrl = new URL(process.env.R23_STAGING_URL ?? 'http://localhost:8080');
const outputPath = path.join(sessionDir, 'playwright-auth.json');

await mkdir(sessionDir, { recursive: true, mode: 0o700 });
await chmod(sessionDir, 0o700);

const browser = await chromium.launch({
  headless: false,
  channel: process.env.R23_BROWSER_CHANNEL ?? 'chrome',
});
const context = await browser.newContext();
const page = await context.newPage();

try {
  await page.goto(new URL('/login', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.getByTestId('feishu-login-button').click({ timeout: 30_000 });
  console.log('已打开真实飞书 OAuth 页面。请在浏览器窗口中手工完成登录。');
  console.log('脚本不会读取或输出密码、OAuth code、Cookie 或 storageState 内容。');
  try {
    await page.waitForURL(
      (url) => url.origin === baseUrl.origin && !url.pathname.startsWith('/login'),
      { timeout: Number(process.env.R23_LOGIN_TIMEOUT_MS ?? 30 * 60 * 1000) },
    );
  } catch {
    throw new Error('真实 OAuth 登录未在时限内完成；未保存任何认证材料。');
  }
  await context.storageState({ path: outputPath });
  await chmod(outputPath, 0o600);
  console.log(`真实 OAuth 会话已安全保存到临时目录：${outputPath}`);
} finally {
  await browser.close();
}

async function validateSessionDir(value) {
  if (!value || !path.isAbsolute(value)) {
    throw new Error('R23_SESSION_DIR 必须是绝对路径。');
  }

  const resolved = path.resolve(value);
  if (!isSafeTempPath(resolved)) {
    throw new Error('认证目录必须位于 /tmp/r23-auth.* 或 /tmp/r24b-zap-auth.*。');
  }

  return resolved;
}

function isSafeTempPath(value) {
  return value.startsWith(`/tmp${path.sep}r23-auth.`) ||
    value.startsWith(`/private/tmp${path.sep}r23-auth.`) ||
    value.startsWith(`/tmp${path.sep}r24b-zap-auth.`) ||
    value.startsWith(`/private/tmp${path.sep}r24b-zap-auth.`);
}
