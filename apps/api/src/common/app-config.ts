import {
  assertFeishuCnOAuthProvider,
  FEISHU_CN_OAUTH_PROVIDER,
  type OAuthProvider,
} from './feishu-oauth-provider';
import { API_UPLOAD_MAX_CONCURRENT_REQUESTS } from './upload-security.constants';

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
  malwareScannerProvider: 'local-eicar' | 'clamav';
  malwareScannerHost: string;
  malwareScannerPort: number;
  malwareScannerTimeoutMs: number;
  uploadAdmissionGlobalLimit: number;
  uploadAdmissionPerActorLimit: number;
  uploadAdmissionPerTargetLimit: number;
  uploadAdmissionRateMaxRequests: number;
  uploadAdmissionRateWindowMs: number;
  downloadAdmissionGlobalLimit: number;
  downloadAdmissionPerActorLimit: number;
  downloadAdmissionPerTargetLimit: number;
  downloadAdmissionRateMaxRequests: number;
  downloadAdmissionRateWindowMs: number;
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

const LOCAL_CONNECTION_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
]);
const PLACEHOLDER_CREDENTIAL_MARKERS = [
  'changeme',
  'placeholder',
  'replace-with',
  'your-',
  'your_',
  '${',
  '<',
  '>',
];
const WEAK_DEFAULT_PASSWORDS = new Set([
  'admin',
  'minioadmin',
  'password',
  'postgres',
  'redis',
]);

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

function resolveBoundedInteger(
  name: string,
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const normalized = value?.trim();
  const parsed = normalized === undefined || normalized === ''
    ? fallback
    : Number(normalized);

  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }

  return parsed;
}

function resolveDeploymentEnvironment(
  value: string | undefined,
  nodeEnv: string,
): AppConfig['deploymentEnvironment'] {
  const normalized = value?.trim().toLowerCase();

  if (normalized === 'local' || normalized === 'staging' || normalized === 'production') {
    return normalized;
  }

  if (normalized) {
    throw new Error('DEPLOYMENT_ENV must be local, staging, or production.');
  }

  if (nodeEnv === 'production' || nodeEnv === 'staging') {
    return nodeEnv;
  }

  return 'local';
}

function decodeUrlCredential(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isPlaceholderCredential(value: string) {
  const normalized = decodeUrlCredential(value).trim().toLowerCase();

  return (
    WEAK_DEFAULT_PASSWORDS.has(normalized) ||
    PLACEHOLDER_CREDENTIAL_MARKERS.some((marker) => normalized.includes(marker))
  );
}

function assertProtectedConnectionUrl(
  name: 'DATABASE_URL' | 'REDIS_URL',
  rawValue: string | undefined,
) {
  const value = rawValue?.trim();

  if (!value) {
    throw new Error(`${name} must be explicitly configured in staging and production.`);
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid connection URL in staging and production.`);
  }

  const allowedProtocols = name === 'DATABASE_URL'
    ? new Set(['postgres:', 'postgresql:'])
    : new Set(['redis:', 'rediss:']);

  if (!allowedProtocols.has(parsed.protocol)) {
    throw new Error(`${name} uses an unsupported protocol.`);
  }

  const hostname = parsed.hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');

  if (
    !hostname ||
    LOCAL_CONNECTION_HOSTS.has(hostname) ||
    hostname.startsWith('127.') ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.docker.internal') ||
    hostname === 'example' ||
    hostname.endsWith('.example') ||
    hostname.endsWith('.example.com')
  ) {
    throw new Error(`${name} must not use a local or placeholder host in staging or production.`);
  }

  const password = decodeUrlCredential(parsed.password).trim();

  if (password.length < 20 || isPlaceholderCredential(password)) {
    throw new Error(
      `${name} must include a non-placeholder password of at least 20 characters in staging and production.`,
    );
  }

  if (
    name === 'DATABASE_URL' &&
    decodeUrlCredential(parsed.username).trim().toLowerCase() === 'postgres' &&
    password.toLowerCase() === 'postgres'
  ) {
    throw new Error('DATABASE_URL must not use the default PostgreSQL credentials.');
  }

  if (name === 'DATABASE_URL' && !parsed.pathname.replace(/^\/+/, '')) {
    throw new Error('DATABASE_URL must include a database name in staging and production.');
  }

  return value;
}

function assertProtectedScannerHost(rawValue: string | undefined) {
  const value = rawValue?.trim() ?? '';
  const normalized = value.toLowerCase();

  if (
    !value ||
    value.length > 253 ||
    !/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(value) ||
    value.includes('..') ||
    normalized === 'localhost' ||
    normalized.startsWith('127.') ||
    normalized.endsWith('.localhost') ||
    normalized.startsWith('replace-') ||
    normalized.includes('placeholder')
  ) {
    throw new Error('CLAMAV_HOST must be an approved non-placeholder scanner hostname.');
  }

  return value;
}

function assertProtectedFrontendUrl(
  rawValue: string | undefined,
  deploymentEnvironment: 'staging' | 'production',
) {
  const value = rawValue?.trim();

  if (!value) {
    throw new Error(
      'FRONTEND_URL must be explicitly configured in staging and production.',
    );
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      'FRONTEND_URL must be a valid origin in staging and production.',
    );
  }

  const hostname = parsed.hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  const isLocalStagingHost =
    deploymentEnvironment === 'staging' &&
    (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1');
  const protocolIsAllowed =
    parsed.protocol === 'https:' ||
    (deploymentEnvironment === 'staging' && isLocalStagingHost && parsed.protocol === 'http:') ||
    // Production is pinned to the one approved HTTPS origin below. Let a
    // syntactically valid HTTP origin reach that exact policy check so the
    // startup error identifies the production invariant that was violated.
    (deploymentEnvironment === 'production' && parsed.protocol === 'http:');
  const hasOriginOnly =
    (parsed.pathname === '' || parsed.pathname === '/') &&
    !parsed.search &&
    !parsed.hash &&
    !parsed.username &&
    !parsed.password;

  if (
    !hostname ||
    !hasOriginOnly ||
    !protocolIsAllowed
  ) {
    throw new Error(
      'FRONTEND_URL must be an HTTPS origin (or an explicit localhost staging origin).',
    );
  }

  return parsed.origin;
}

export function resolveAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV?.trim().toLowerCase() || 'development';
  const deploymentEnvironment = resolveDeploymentEnvironment(
    env.DEPLOYMENT_ENV,
    nodeEnv,
  );
  const isProtectedEnvironment =
    deploymentEnvironment === 'staging' || deploymentEnvironment === 'production';
  const databaseUrl = isProtectedEnvironment
    ? assertProtectedConnectionUrl('DATABASE_URL', env.DATABASE_URL)
    : env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/feishu_timeline?schema=public';
  const redisUrl = isProtectedEnvironment
    ? assertProtectedConnectionUrl('REDIS_URL', env.REDIS_URL)
    : env.REDIS_URL ?? 'redis://localhost:6379';
  const scannerProviderValue =
    env.MALWARE_SCANNER_PROVIDER?.trim().toLowerCase() ||
    (isProtectedEnvironment ? '' : 'local-eicar');

  if (
    scannerProviderValue !== 'local-eicar' &&
    scannerProviderValue !== 'clamav'
  ) {
    throw new Error(
      'MALWARE_SCANNER_PROVIDER must be local-eicar or clamav.',
    );
  }

  if (isProtectedEnvironment && scannerProviderValue !== 'clamav') {
    throw new Error(
      'MALWARE_SCANNER_PROVIDER must be clamav in staging and production.',
    );
  }

  const localScannerHost = env.CLAMAV_HOST?.trim() ?? '';
  let malwareScannerHost = '';
  if (scannerProviderValue === 'clamav') {
    if (!localScannerHost) {
      throw new Error('CLAMAV_HOST must be configured for the ClamAV scanner.');
    }
    malwareScannerHost = isProtectedEnvironment
      ? assertProtectedScannerHost(localScannerHost)
      : localScannerHost;
  }

  const config: AppConfig = {
    nodeEnv,
    deploymentEnvironment,
    runtimeCommit: env.RUNTIME_COMMIT?.trim() || 'unknown',
    buildTime: env.BUILD_TIME?.trim() || 'unknown',
    release: env.RELEASE?.trim() || 'development',
    port: resolvePort(env.PORT, 3001),
    frontendUrl: env.FRONTEND_URL?.trim() ||
      (isProtectedEnvironment ? '' : 'http://localhost:3000'),
    databaseUrl,
    redisUrl,
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
    malwareScannerProvider: scannerProviderValue,
    malwareScannerHost,
    malwareScannerPort: resolveBoundedInteger(
      'CLAMAV_PORT',
      env.CLAMAV_PORT,
      3310,
      1,
      65535,
    ),
    malwareScannerTimeoutMs: resolveBoundedInteger(
      'CLAMAV_TIMEOUT_MS',
      env.CLAMAV_TIMEOUT_MS,
      15000,
      1000,
      60000,
    ),
    uploadAdmissionGlobalLimit: resolveBoundedInteger(
      'UPLOAD_ADMISSION_GLOBAL_LIMIT',
      env.UPLOAD_ADMISSION_GLOBAL_LIMIT,
      4,
      1,
      API_UPLOAD_MAX_CONCURRENT_REQUESTS,
    ),
    uploadAdmissionPerActorLimit: resolveBoundedInteger(
      'UPLOAD_ADMISSION_PER_ACTOR_LIMIT',
      env.UPLOAD_ADMISSION_PER_ACTOR_LIMIT,
      2,
      1,
      4,
    ),
    uploadAdmissionPerTargetLimit: resolveBoundedInteger(
      'UPLOAD_ADMISSION_PER_TARGET_LIMIT',
      env.UPLOAD_ADMISSION_PER_TARGET_LIMIT,
      3,
      1,
      API_UPLOAD_MAX_CONCURRENT_REQUESTS,
    ),
    uploadAdmissionRateMaxRequests: resolveBoundedInteger(
      'UPLOAD_ADMISSION_RATE_MAX_REQUESTS',
      env.UPLOAD_ADMISSION_RATE_MAX_REQUESTS,
      6,
      1,
      60,
    ),
    uploadAdmissionRateWindowMs: resolveBoundedInteger(
      'UPLOAD_ADMISSION_RATE_WINDOW_MS',
      env.UPLOAD_ADMISSION_RATE_WINDOW_MS,
      60_000,
      1_000,
      300_000,
    ),
    downloadAdmissionGlobalLimit: resolveBoundedInteger(
      'DOWNLOAD_ADMISSION_GLOBAL_LIMIT',
      env.DOWNLOAD_ADMISSION_GLOBAL_LIMIT,
      8,
      1,
      32,
    ),
    downloadAdmissionPerActorLimit: resolveBoundedInteger(
      'DOWNLOAD_ADMISSION_PER_ACTOR_LIMIT',
      env.DOWNLOAD_ADMISSION_PER_ACTOR_LIMIT,
      2,
      1,
      8,
    ),
    downloadAdmissionPerTargetLimit: resolveBoundedInteger(
      'DOWNLOAD_ADMISSION_PER_TARGET_LIMIT',
      env.DOWNLOAD_ADMISSION_PER_TARGET_LIMIT,
      2,
      1,
      8,
    ),
    downloadAdmissionRateMaxRequests: resolveBoundedInteger(
      'DOWNLOAD_ADMISSION_RATE_MAX_REQUESTS',
      env.DOWNLOAD_ADMISSION_RATE_MAX_REQUESTS,
      12,
      1,
      120,
    ),
    downloadAdmissionRateWindowMs: resolveBoundedInteger(
      'DOWNLOAD_ADMISSION_RATE_WINDOW_MS',
      env.DOWNLOAD_ADMISSION_RATE_WINDOW_MS,
      60_000,
      1_000,
      300_000,
    ),
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

  if (isProtectedEnvironment && config.authMockEnabled) {
    throw new Error('AUTH_MOCK_ENABLED must be false in staging and production.');
  }

  if (config.uploadAdmissionPerActorLimit > config.uploadAdmissionGlobalLimit) {
    throw new Error(
      'UPLOAD_ADMISSION_PER_ACTOR_LIMIT must not exceed UPLOAD_ADMISSION_GLOBAL_LIMIT.',
    );
  }

  if (
    config.downloadAdmissionPerActorLimit > config.downloadAdmissionGlobalLimit ||
    config.downloadAdmissionPerTargetLimit > config.downloadAdmissionGlobalLimit
  ) {
    throw new Error(
      'DOWNLOAD_ADMISSION_PER_ACTOR_LIMIT and DOWNLOAD_ADMISSION_PER_TARGET_LIMIT must not exceed DOWNLOAD_ADMISSION_GLOBAL_LIMIT.',
    );
  }

  if (isProtectedEnvironment && config.nodeEnv !== 'production') {
    throw new Error('NODE_ENV must be production in staging and production deployments.');
  }

  if (isProtectedEnvironment) {
    config.frontendUrl = assertProtectedFrontendUrl(
      env.FRONTEND_URL,
      deploymentEnvironment,
    );
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
    const configuredFrontendUrl = config.frontendUrl;
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
