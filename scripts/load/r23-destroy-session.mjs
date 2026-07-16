import { chmod, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const sessionFile = await validateTempPath(process.env.K6_SESSION_FILE);
const sessionDir = path.dirname(sessionFile);
const session = JSON.parse(await readFile(sessionFile, 'utf8'));
let logoutSucceeded = false;

try {
  const response = await fetch(new URL('/api/auth/logout', session.baseUrl), {
    method: 'POST',
    headers: {
      Cookie: session.cookieHeader,
      Origin: session.baseUrl,
      Accept: 'application/json',
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  logoutSucceeded = [200, 201, 204].includes(response.status);
  await response.body?.cancel();
} finally {
  await chmod(sessionDir, 0o700).catch(() => undefined);
  await rm(sessionDir, { recursive: true, force: true });
}

console.log(JSON.stringify({ authSessionLogoutSucceeded: logoutSucceeded, authMaterialDestroyed: true }));
if (!logoutSucceeded) process.exitCode = 1;

async function validateTempPath(value) {
  if (!value || !path.isAbsolute(value)) throw new Error('K6_SESSION_FILE 必须是绝对路径。');
  const resolved = path.resolve(value);
  if (!isSafeTempPath(resolved)) {
    throw new Error('认证文件必须位于 /tmp/r23-auth.*。');
  }
  return resolved;
}

function isSafeTempPath(value) {
  return value.startsWith(`/tmp${path.sep}r23-auth.`) ||
    value.startsWith(`/private/tmp${path.sep}r23-auth.`);
}
