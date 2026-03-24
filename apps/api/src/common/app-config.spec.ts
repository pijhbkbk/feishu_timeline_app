import { describe, expect, it } from 'vitest';

import { resolveAppConfig } from './app-config';

describe('resolveAppConfig', () => {
  it('returns defaults when env is missing', () => {
    const config = resolveAppConfig({});

    expect(config.port).toBe(3001);
    expect(config.frontendUrl).toBe('http://localhost:3000');
    expect(config.redisUrl).toBe('redis://localhost:6379');
    expect(config.notificationQueueEnabled).toBe(true);
    expect(config.notificationQueuePollMs).toBe(5000);
    expect(config.notificationOverdueScanMs).toBe(300000);
    expect(config.notificationMaxRetries).toBe(3);
    expect(config.authMockEnabled).toBe(true);
    expect(config.sessionCookieName).toBe('ft_session');
    expect(config.objectStorageProvider).toBe('local');
    expect(config.objectStorageLocalRoot).toBe('var/object-storage');
  });
});
