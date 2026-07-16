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

  it('pins the production OAuth callback to the configured frontend', () => {
    expect(() =>
      resolveAppConfig({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://timeline.example.com',
        FEISHU_REDIRECT_URI: 'https://attacker.example/callback',
      }),
    ).toThrowError('FEISHU_REDIRECT_URI must match FRONTEND_URL/login/callback in production.');

    expect(
      resolveAppConfig({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://timeline.example.com',
        FEISHU_REDIRECT_URI: 'https://timeline.example.com/login/callback',
      }).feishuRedirectUri,
    ).toBe('https://timeline.example.com/login/callback');
  });

  it('accepts only the approved HTTPS Feishu authorization endpoint', () => {
    for (const endpoint of [
      'http://open.feishu.cn/open-apis/authen/v1/index',
      'https://open.feishu.cn.attacker.example/open-apis/authen/v1/index',
      'https://open.feishu.cn/open-apis/authen/v1/index?next=https://attacker.example',
    ]) {
      expect(() =>
        resolveAppConfig({ FEISHU_AUTHORIZATION_ENDPOINT: endpoint }),
      ).toThrowError(
        'FEISHU_AUTHORIZATION_ENDPOINT must use the approved Feishu OAuth endpoint.',
      );
    }

    expect(
      resolveAppConfig({
        FEISHU_AUTHORIZATION_ENDPOINT:
          'https://accounts.feishu.cn/open-apis/authen/v1/index',
      }).feishuAuthorizationEndpoint,
    ).toBe('https://accounts.feishu.cn/open-apis/authen/v1/index');
  });
});
