import { chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const inputPath = await validateTempPath(process.env.R23_PLAYWRIGHT_AUTH_FILE, '输入');
const outputPath = await validateTempPath(process.env.K6_SESSION_FILE, '输出');
const baseUrl = new URL(process.env.R23_STAGING_URL ?? 'http://localhost:8080');
const storageState = JSON.parse(await readFile(inputPath, 'utf8'));
const nowSeconds = Date.now() / 1000;

const sessionCookies = (Array.isArray(storageState.cookies) ? storageState.cookies : []).filter(
  (cookie) =>
    cookie?.name === 'ft_session' &&
    typeof cookie.value === 'string' &&
    cookie.value.length > 0 &&
    cookieMatchesHost(cookie.domain, baseUrl.hostname) &&
    (cookie.expires === -1 || Number(cookie.expires) > nowSeconds),
);

if (sessionCookies.length !== 1) {
  throw new Error('临时 storageState 中没有唯一、有效的 staging ft_session。');
}

const sessionCookie = sessionCookies[0];
const output = {
  schemaVersion: 1,
  baseUrl: baseUrl.origin,
  cookieHeader: `${sessionCookie.name}=${sessionCookie.value}`,
  expiresAt:
    sessionCookie.expires === -1
      ? null
      : new Date(Number(sessionCookie.expires) * 1000).toISOString(),
};

await writeFile(outputPath, `${JSON.stringify(output)}\n`, { encoding: 'utf8', mode: 0o600 });
await chmod(outputPath, 0o600);
console.log(`k6 最小认证文件已写入临时目录：${outputPath}`);

function cookieMatchesHost(domain, hostname) {
  if (typeof domain !== 'string') return false;
  const normalized = domain.replace(/^\./, '').toLowerCase();
  const host = hostname.toLowerCase();
  return normalized === host || host.endsWith(`.${normalized}`);
}

async function validateTempPath(value, label) {
  if (!value || !path.isAbsolute(value)) {
    throw new Error(`${label}认证文件必须使用绝对路径。`);
  }

  const resolved = path.resolve(value);
  if (!isSafeTempPath(resolved)) {
    throw new Error(`${label}认证文件必须位于 /tmp/r23-auth.*。`);
  }

  return resolved;
}

function isSafeTempPath(value) {
  return value.startsWith(`/tmp${path.sep}r23-auth.`) ||
    value.startsWith(`/private/tmp${path.sep}r23-auth.`);
}
