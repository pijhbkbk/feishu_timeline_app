import { describe, expect, it } from 'vitest';

import { APP_ENV_FILE_PATHS, resolveAppConfig } from './app-config';

describe('resolveAppConfig', () => {
  it('never treats example files as runtime configuration', () => {
    expect(APP_ENV_FILE_PATHS).toEqual(['.env.local', '.env']);
    expect(APP_ENV_FILE_PATHS).not.toContain('.env.example');
  });

  it('returns defaults when env is missing', () => {
    const config = resolveAppConfig({});

    expect(config.port).toBe(3001);
    expect(config.frontendUrl).toBe('http://localhost:3000');
    expect(config.redisUrl).toBe('redis://localhost:6379');
    expect(config.notificationQueueEnabled).toBe(true);
    expect(config.notificationQueuePollMs).toBe(5000);
    expect(config.notificationOverdueScanMs).toBe(300000);
    expect(config.notificationMaxRetries).toBe(3);
    expect(config.authMockEnabled).toBe(false);
    expect(config.sessionCookieName).toBe('ft_session');
    expect(config.objectStorageProvider).toBe('local');
    expect(config.objectStorageLocalRoot).toBe('var/object-storage');
  });

  it('allows mock auth only when it is explicitly enabled outside production', () => {
    const config = resolveAppConfig({
      NODE_ENV: 'development',
      AUTH_MOCK_ENABLED: 'true',
    });

    expect(config.authMockEnabled).toBe(true);
  });

  it('refuses to resolve production configuration when mock auth is enabled', () => {
    expect(() =>
      resolveAppConfig({
        NODE_ENV: ' Production ',
        AUTH_MOCK_ENABLED: 'true',
      }),
    ).toThrowError('AUTH_MOCK_ENABLED must be false when NODE_ENV=production.');
  });
});
