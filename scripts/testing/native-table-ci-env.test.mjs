import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeTableEnvironment } from './native-table-ci-env.mjs';
const base = { CI: 'true', GITHUB_ACTIONS: 'true' };
test('native runner supplies exact isolated endpoints before any subprocess', () => {
  const result = nativeTableEnvironment(base);
  assert.equal(result.DATABASE_URL, 'postgresql://postgres:postgres@localhost:5432/feishu_timeline?schema=public');
  assert.equal(result.AUTH_MOCK_ENABLED, 'false');
  assert.equal(result.PLAYWRIGHT_BASE_URL, 'http://localhost:3000');
  assert.deepEqual(nativeTableEnvironment({ ...base, ...result }), result);
});
test('conflicting inherited targets and bypass modes reject without exposing values', () => {
  for (const key of Object.keys(nativeTableEnvironment(base)).filter(k => k !== 'PLAYWRIGHT_NATIVE_TABLE')) {
    assert.throws(() => nativeTableEnvironment({ ...base, [key]: 'sensitive-conflict' }), e => e.message === `NATIVE_CI_CONFLICT_${key}`);
  }
  for (const key of ['PLAYWRIGHT_STORAGE_STATE', 'PLAYWRIGHT_EXTERNAL_SERVER', 'OBJECT_STORAGE_LOCAL_ROOT', 'NATIVE_TABLE_CI_STATE']) {
    assert.throws(() => nativeTableEnvironment({ ...base, [key]: 'sensitive-conflict' }), e => e.message === `NATIVE_CI_FORBIDDEN_${key}`);
  }
});
test('native setup rejects non-CI execution', () => {
  for (const value of [{}, { CI: 'true' }, { GITHUB_ACTIONS: 'true' }]) assert.throws(() => nativeTableEnvironment(value), /NATIVE_CI_RUNNER_REQUIRED/);
});
