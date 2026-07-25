import {
  assertFeishuCnOAuthProvider,
  FEISHU_CN_OAUTH_PROVIDER,
  type OAuthProvider,
} from './feishu-oauth-provider';

export type AppConfig = {
  nodeEnv: string;
  deploymentEnvironment: 'local' | 'staging' | 'production';
  runtimeCommit: string;
  buildTime: string;
  release: string;
  port: number;
  frontendUrl: string;
  databaseUrl: string;
  redisUrl: string;
  notificationQueueEnabled: boolean;
  notificationQueuePollMs: number;
  notificationOverdueScanMs: number;
  notificationRetryDelayMs: number;
  notificationMaxRetries: number;
  authMockEnabled: boolean;
  sessionCookieName: string;
  sessionTtlSeconds: number;
  objectStorageProvider: 'local' | 's3' | 'minio' | 'oss';
  objectStorageLocalRoot: string;
  objectStorageEndpoint: string;
  objectStorageBucket: string;
  objectStorageAccessKey: string;
  objectStorageSecretKey: string;
  feishuAppId: string;
  feishuAppSecret: string;
  feishuRedirectUri: string;
  oauthProvider: OAuthProvider;
  feishuAuthorizationEndpoint: string;
  feishuTokenEndpoint: string;
  feishuUserInfoEndpoint: string;
  feishuApiBaseUrl: string;
};

export const APP_ENV_FILE_PATHS = ['.env.local', '.env'] as const;

function resolvePort(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function resolveBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  return value === 'true';
}

function resolveDeploymentEnvironment(
  value: string | undefined,
  nodeEnv: string,
): AppConfig['deploymentEnvironment'] {
  const normalized = value?.trim().toLowerCase();

  if (normalized === 'local' || normalized === 'staging' || normalized === 'production') {
    return normalized;
  }

  return nodeEnv === 'production' ? 'production' : 'local';
}

export function resolveAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV?.trim().toLowerCase() || 'development';
  const config: AppConfig = {
    nodeEnv,
    deploymentEnvironment: resolveDeploymentEnvironment(env.DEPLOYMENT_ENV, nodeEnv),
    runtimeCommit: env.RUNTIME_COMMIT?.trim() || 'unknown',
    buildTime: env.BUILD_TIME?.trim() || 'unknown',
    release: env.RELEASE?.trim() || 'development',
    port: resolvePort(env.PORT, 3001),
    frontendUrl: env.FRONTEND_URL ?? 'http://localhost:3000',
    databaseUrl:
      env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/feishu_timeline?schema=public',
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
    notificationQueueEnabled: resolveBoolean(env.NOTIFICATION_QUEUE_ENABLED, true),
    notificationQueuePollMs: resolvePort(env.NOTIFICATION_QUEUE_POLL_MS, 5000),
    notificationOverdueScanMs: resolvePort(env.NOTIFICATION_OVERDUE_SCAN_MS, 300000),
    notificationRetryDelayMs: resolvePort(env.NOTIFICATION_RETRY_DELAY_MS, 5000),
    notificationMaxRetries: resolvePort(env.NOTIFICATION_MAX_RETRIES, 3),
    authMockEnabled: resolveBoolean(env.AUTH_MOCK_ENABLED, false),
    sessionCookieName: env.SESSION_COOKIE_NAME ?? 'ft_session',
    sessionTtlSeconds: resolvePort(env.SESSION_TTL_SECONDS, 28800),
    objectStorageProvider:
      (env.OBJECT_STORAGE_PROVIDER as AppConfig['objectStorageProvider'] | undefined) ?? 'local',
    objectStorageLocalRoot: env.OBJECT_STORAGE_LOCAL_ROOT ?? 'var/object-storage',
    objectStorageEndpoint: env.OBJECT_STORAGE_ENDPOINT ?? 'http://localhost:9000',
    objectStorageBucket: env.OBJECT_STORAGE_BUCKET ?? 'feishu-timeline-local',
    objectStorageAccessKey: env.OBJECT_STORAGE_ACCESS_KEY ?? 'minioadmin',
    objectStorageSecretKey: env.OBJECT_STORAGE_SECRET_KEY ?? 'minioadmin',
    feishuAppId: env.FEISHU_APP_ID ?? '',
    feishuAppSecret: env.FEISHU_APP_SECRET ?? '',
    feishuRedirectUri: env.FEISHU_REDIRECT_URI ?? 'http://localhost:3000/login/callback',
    oauthProvider:
      (env.OAUTH_PROVIDER?.trim().toLowerCase() as OAuthProvider | undefined) ??
      FEISHU_CN_OAUTH_PROVIDER.id,
    feishuAuthorizationEndpoint:
      env.FEISHU_AUTHORIZATION_ENDPOINT?.trim() ??
      FEISHU_CN_OAUTH_PROVIDER.authorizationEndpoint,
    feishuTokenEndpoint: FEISHU_CN_OAUTH_PROVIDER.tokenEndpoint,
    feishuUserInfoEndpoint: FEISHU_CN_OAUTH_PROVIDER.userInfoEndpoint,
    feishuApiBaseUrl: FEISHU_CN_OAUTH_PROVIDER.apiBaseUrl,
  };

  if (config.nodeEnv === 'production' && config.authMockEnabled) {
    throw new Error('AUTH_MOCK_ENABLED must be false when NODE_ENV=production.');
  }

  assertFeishuCnOAuthProvider({
    oauthProvider: config.oauthProvider,
    authorizationEndpoint: config.feishuAuthorizationEndpoint,
    tokenEndpoint: config.feishuTokenEndpoint,
    userInfoEndpoint: config.feishuUserInfoEndpoint,
    apiBaseUrl: config.feishuApiBaseUrl,
  });

  if (config.deploymentEnvironment === 'production') {
    const expectedFrontendUrl = 'https://timeline.all-too-well.com';
    const expectedRedirectUri = `${expectedFrontendUrl}/login/callback`;
    const configuredFrontendUrl = new URL(config.frontendUrl).toString().replace(/\/$/, '');
    const configuredRedirectUri = new URL(config.feishuRedirectUri).toString();

    if (configuredFrontendUrl !== expectedFrontendUrl) {
      throw new Error(
        'FRONTEND_URL must be https://timeline.all-too-well.com in production.',
      );
    }

    if (configuredRedirectUri !== expectedRedirectUri) {
      throw new Error('FEISHU_REDIRECT_URI must be the approved production callback.');
    }

    if (
      !config.feishuAppId.trim() ||
      !config.feishuAppSecret.trim() ||
      config.feishuAppId === 'your_feishu_app_id' ||
      config.feishuAppSecret === 'your_feishu_app_secret'
    ) {
      throw new Error('Feishu production credentials must be configured.');
    }
  }

  return config;
}

export default () => resolveAppConfig();
