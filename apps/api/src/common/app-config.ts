export type AppConfig = {
  nodeEnv: string;
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
  feishuAuthorizationEndpoint: string;
};

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

export function resolveAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    nodeEnv: env.NODE_ENV ?? 'development',
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
    authMockEnabled: resolveBoolean(env.AUTH_MOCK_ENABLED, true),
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
    feishuAuthorizationEndpoint: env.FEISHU_AUTHORIZATION_ENDPOINT ?? '',
  };
}

export default () => resolveAppConfig();
