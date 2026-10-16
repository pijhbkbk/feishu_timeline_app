import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = process.env.NATIVE_AUTH_TEST_API_URL;
assert.equal(base, 'http://127.0.0.1:3351', 'This test may only target the isolated local API.');
const origin = 'http://127.0.0.1:3350';
const username = `http-${randomUUID().slice(0, 8)}`;
const password = 'Isolated HTTP authentication phrase 2026!';
const newPassword = 'Changed isolated HTTP authentication phrase 2026!';
let cookie;
let count = 0;
async function request(path, method = 'GET', body, suppliedCookie = cookie, suppliedOrigin = origin) {
  const headers = {};
  if (suppliedCookie) headers.Cookie = suppliedCookie;
  if (suppliedOrigin) headers.Origin = suppliedOrigin;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${base}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  count++;
  return { response, data, status: response.status };
}
const credentials = { username, password, name: 'HTTP 隔离测试账号' };
assert.equal((await request('/auth/register', 'POST', credentials, undefined, undefined)).status, 201);
// The default origin above is intentional; separately test explicit absent and attacker origins.
assert.equal((await request('/auth/register', 'POST', { ...credentials, username: `${username}-a` }, undefined, '')).status, 403);
assert.equal((await request('/auth/login', 'POST', { username, password }, undefined, 'https://attacker.invalid')).status, 403);
for (const field of ['isSystemAdmin', 'roleCodes', 'departmentId']) {
  assert.equal((await request('/auth/register', 'POST', { ...credentials, username: `${username}-b`, [field]: field === 'roleCodes' ? ['admin'] : true })).status, 400);
}
assert.equal((await request('/auth/register', 'POST', { ...credentials, username: username.toUpperCase() })).status, 409);
let login = await request('/auth/login', 'POST', { username, password });
assert.equal(login.status, 200);
assert.deepEqual(login.data.user.roleCodes, []);
assert.deepEqual(login.data.user.permissionCodes, []);
assert.equal(login.data.user.isSystemAdmin, false);
assert.equal(login.data.user.authSource, 'local');
assert.equal(login.data.feishuEnabled, false);
assert.equal(login.data.mockEnabled, false);
const firstCookie = login.response.headers.get('set-cookie');
assert.match(firstCookie, /HttpOnly/i);
assert.match(firstCookie, /SameSite=Lax/i);
cookie = firstCookie.split(';')[0];
assert.equal((await request('/auth/me')).status, 200);
assert.equal((await request('/auth/accounts')).status, 403);
assert.equal((await request('/auth/accounts/another/recovery', 'POST')).status, 403);
assert.equal((await request('/admin/organization')).status === 200, false);
assert.equal((await request('/projects', 'POST', { name: 'Unauthorized project' })).status, 403);
assert.equal((await request('/auth/job', 'POST', { job: 'purchaser', roleCodes: ['admin'] })).status, 400);
assert.equal((await request('/auth/job', 'POST', { job: 'purchaser' })).status, 200);
let me = await request('/auth/me');
assert.equal(me.data.requestedJob, 'purchaser');
assert.equal(me.data.onboardingCompleted, true);
assert.deepEqual(me.data.roleCodes, []);
assert.equal((await request('/auth/job', 'POST', { job: 'process_engineer' })).status, 409);
const second = await request('/auth/login', 'POST', { username, password });
assert.equal(second.status, 200);
const secondCookie = second.response.headers.get('set-cookie').split(';')[0];
assert.notEqual(secondCookie, cookie);
assert.equal((await request('/auth/me')).status, 401);
cookie = secondCookie;
assert.equal((await request('/auth/password', 'POST', { currentPassword: password, newPassword })).status, 200);
assert.equal((await request('/auth/me')).status, 401);
assert.equal((await request('/auth/login', 'POST', { username, password })).status, 401);
login = await request('/auth/login', 'POST', { username, password: newPassword });
assert.equal(login.status, 200);
cookie = login.response.headers.get('set-cookie').split(';')[0];
assert.equal((await request('/auth/logout', 'POST')).status, 200);
assert.equal((await request('/auth/me')).status, 401);
assert.equal((await request('/auth/logout', 'POST')).status, 200);
assert.equal((await request('/auth/mock-login', 'POST', { roleCodes: ['admin'] })).status, 403);
for (const path of ['/auth/feishu/start', '/auth/feishu/login-url']) {
  const result = await request(path);
  assert.equal(result.status, 410);
  assert.equal(result.response.headers.get('location'), null);
}
assert.equal((await request('/auth/feishu/callback', 'POST', { code: 'retired', state: randomUUID() })).status, 410);
assert.equal((await request('/auth/initialize', 'POST', {})).status, 404);
assert.equal((await request('/auth/bind', 'POST', {})).status, 404);
console.log(JSON.stringify({ status: 'PASS', requestCount: count, scope: 'native HTTP registration/login/DTO/Origin/session/job/permission/password/logout/retired routes', credentialsRecorded: false }));
