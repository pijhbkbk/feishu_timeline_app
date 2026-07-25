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
    expect(config.deploymentEnvironment).toBe('local');
    expect(config.runtimeCommit).toBe('unknown');
    expect(config.buildTime).toBe('unknown');
    expect(config.release).toBe('development');
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
    expect(config.oauthProvider).toBe('feishu-cn');
    expect(config.feishuAuthorizationEndpoint).toBe(
      'https://accounts.feishu.cn/open-apis/authen/v1/index',
    );
    expect(config.feishuTokenEndpoint).toBe(
      'https://open.feishu.cn/open-apis/authen/v2/oauth/token',
    );
    expect(config.feishuUserInfoEndpoint).toBe(
      'https://open.feishu.cn/open-apis/authen/v1/user_info',
    );
  });

  it('exposes only non-sensitive release identity metadata', () => {
    const config = resolveAppConfig({
      RUNTIME_COMMIT: '0123456789abcdef0123456789abcdef01234567',
      BUILD_TIME: '2026-07-25T13:30:00Z',
      RELEASE: 'r26-admin-controls',
    });

    expect(config.runtimeCommit).toBe('0123456789abcdef0123456789abcdef01234567');
    expect(config.buildTime).toBe('2026-07-25T13:30:00Z');
    expect(config.release).toBe('r26-admin-controls');
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

  it('pins production OAuth to the approved HTTPS callback and credentials', () => {
    expect(() =>
      resolveAppConfig({
        NODE_ENV: 'production',
        DEPLOYMENT_ENV: 'production',
        FRONTEND_URL: 'https://timeline.all-too-well.com',
        FEISHU_REDIRECT_URI: 'https://attacker.example/callback',
        FEISHU_APP_ID: 'production-app',
        FEISHU_APP_SECRET: 'production-secret',
      }),
    ).toThrowError('FEISHU_REDIRECT_URI must be the approved production callback.');

    expect(
      resolveAppConfig({
        NODE_ENV: 'production',
        DEPLOYMENT_ENV: 'production',
        FRONTEND_URL: 'https://timeline.all-too-well.com',
        FEISHU_REDIRECT_URI: 'https://timeline.all-too-well.com/login/callback',
        FEISHU_APP_ID: 'production-app',
        FEISHU_APP_SECRET: 'production-secret',
      }).feishuRedirectUri,
    ).toBe('https://timeline.all-too-well.com/login/callback');
  });

  it('accepts only the approved Feishu CN provider and authorization endpoint', () => {
    for (const endpoint of [
      'http://open.feishu.cn/open-apis/authen/v1/index',
      'https://open.feishu.cn.attacker.example/open-apis/authen/v1/index',
      'https://open.feishu.cn/open-apis/authen/v1/index?next=https://attacker.example',
      'https://open.feishu.cn/open-apis/authen/v1/index',
      'https://accounts.larksuite.com/open-apis/authen/v1/index',
    ]) {
      expect(() =>
        resolveAppConfig({ FEISHU_AUTHORIZATION_ENDPOINT: endpoint }),
      ).toThrowError(
        'FEISHU_AUTHORIZATION_ENDPOINT must use the approved Feishu CN endpoint.',
      );
    }

    expect(() =>
      resolveAppConfig({
        OAUTH_PROVIDER: 'lark',
      }),
    ).toThrowError('OAUTH_PROVIDER must be feishu-cn.');

    expect(
      resolveAppConfig({
        OAUTH_PROVIDER: 'feishu-cn',
        FEISHU_AUTHORIZATION_ENDPOINT:
          'https://accounts.feishu.cn/open-apis/authen/v1/index',
      }).feishuAuthorizationEndpoint,
    ).toBe('https://accounts.feishu.cn/open-apis/authen/v1/index');
  });

  it('allows an explicit staging deployment to use its registered local callback', () => {
    const config = resolveAppConfig({
      NODE_ENV: 'production',
      DEPLOYMENT_ENV: 'staging',
      FRONTEND_URL: 'http://localhost:8080',
      FEISHU_REDIRECT_URI: 'http://localhost:8080/login/callback',
    });

    expect(config.deploymentEnvironment).toBe('staging');
    expect(config.oauthProvider).toBe('feishu-cn');
  });

  it('rejects incomplete or non-production production identity configuration', () => {
    expect(() =>
      resolveAppConfig({
        NODE_ENV: 'production',
        DEPLOYMENT_ENV: 'production',
        FRONTEND_URL: 'http://timeline.all-too-well.com',
        FEISHU_REDIRECT_URI: 'http://timeline.all-too-well.com/login/callback',
        FEISHU_APP_ID: 'production-app',
        FEISHU_APP_SECRET: 'production-secret',
      }),
    ).toThrowError(
      'FRONTEND_URL must be https://timeline.all-too-well.com in production.',
    );

    expect(() =>
      resolveAppConfig({
        NODE_ENV: 'production',
        DEPLOYMENT_ENV: 'production',
        FRONTEND_URL: 'https://timeline.all-too-well.com',
        FEISHU_REDIRECT_URI: 'https://timeline.all-too-well.com/login/callback',
      }),
    ).toThrowError('Feishu production credentials must be configured.');

    expect(() =>
      resolveAppConfig({
        NODE_ENV: 'production',
        DEPLOYMENT_ENV: 'production',
        FRONTEND_URL: 'https://timeline.all-too-well.com',
        FEISHU_REDIRECT_URI: 'https://timeline.all-too-well.com/login/callback',
        FEISHU_APP_ID: 'your_feishu_app_id',
        FEISHU_APP_SECRET: 'your_feishu_app_secret',
      }),
    ).toThrowError('Feishu production credentials must be configured.');
  });
});
