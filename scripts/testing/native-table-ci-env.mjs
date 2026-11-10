// This entry prepares a fresh GitHub-hosted CI database, never a restore or a
// developer's inherited target. Validate before infrastructure or migration.
export function nativeTableEnvironment(env) {
  if (env.CI !== 'true' || env.GITHUB_ACTIONS !== 'true') throw Error('NATIVE_CI_RUNNER_REQUIRED');
  const fixed = {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/feishu_timeline?schema=public',
    REDIS_URL: 'redis://localhost:6379',
    FRONTEND_URL: 'http://localhost:3000',
    NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001/api',
    PLAYWRIGHT_BASE_URL: 'http://localhost:3000',
    PORT: '3001', HOST: '127.0.0.1', NODE_ENV: 'development', DEPLOYMENT_ENV: 'local',
    AUTH_MOCK_ENABLED: 'false', NEXT_PUBLIC_ENABLE_MOCK_LOGIN: 'false',
    NOTIFICATION_QUEUE_ENABLED: 'false',
  };
  for (const [key, value] of Object.entries(fixed)) {
    if (env[key] !== undefined && env[key] !== value) throw Error(`NATIVE_CI_CONFLICT_${key}`);
  }
  for (const key of ['PLAYWRIGHT_STORAGE_STATE', 'PLAYWRIGHT_EXTERNAL_SERVER', 'OBJECT_STORAGE_LOCAL_ROOT', 'NATIVE_TABLE_CI_STATE']) {
    if (env[key] !== undefined) throw Error(`NATIVE_CI_FORBIDDEN_${key}`);
  }
  return { ...fixed, PLAYWRIGHT_NATIVE_TABLE: '1' };
}
