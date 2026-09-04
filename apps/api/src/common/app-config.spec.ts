import { describe, expect, it } from 'vitest';

import {
  APP_ENV_FILE_PATHS,
  resolveAppConfig as resolveAppConfigImplementation,
} from './app-config';
import {
  LOCAL_DEVELOPMENT_BUILD_IDENTITY,
  type BuildIdentity,
} from './build-identity';

const TEST_PROTECTED_BUILD_IDENTITY: BuildIdentity = Object.freeze({
  sourceCommit: '0123456789abcdef0123456789abcdef01234567',
  sourceTree: '89abcdef0123456789abcdef0123456789abcdef',
  release: 'r27rc1-test',
  buildTime: '2026-09-04T01:02:03Z',
});
const TEST_PROTECTED_EXPECTED_IDENTITY_ENV = {
  EXPECTED_SOURCE_COMMIT: TEST_PROTECTED_BUILD_IDENTITY.sourceCommit,
  EXPECTED_SOURCE_TREE: TEST_PROTECTED_BUILD_IDENTITY.sourceTree,
  EXPECTED_RELEASE: TEST_PROTECTED_BUILD_IDENTITY.release,
  EXPECTED_BUILD_TIME: TEST_PROTECTED_BUILD_IDENTITY.buildTime,
} as const;

function resolveAppConfig(env: NodeJS.ProcessEnv = {}) {
  const nodeEnvironment = env.NODE_ENV?.trim().toLowerCase();
  const deploymentEnvironment = env.DEPLOYMENT_ENV?.trim().toLowerCase();
  const isProtectedEnvironment =
    deploymentEnvironment === 'staging' ||
    deploymentEnvironment === 'production' ||
    (!deploymentEnvironment &&
      (nodeEnvironment === 'staging' || nodeEnvironment === 'production'));

  return resolveAppConfigImplementation(
    isProtectedEnvironment
      ? { ...TEST_PROTECTED_EXPECTED_IDENTITY_ENV, ...env }
      : env,
    isProtectedEnvironment
      ? TEST_PROTECTED_BUILD_IDENTITY
      : LOCAL_DEVELOPMENT_BUILD_IDENTITY,
  );
}

const PROTECTED_DATA_ENV = {
  DATABASE_URL:
    'postgresql://app_user:test-only-strong-db-password@postgres:5432/feishu_timeline?schema=public',
  REDIS_URL: 'redis://:test-only-strong-redis-password@redis:6379',
} as const;
const PROTECTED_SCANNER_ENV = {
  MALWARE_SCANNER_PROVIDER: 'clamav',
  CLAMAV_HOST: 'clamav-scanner.internal',
} as const;
const PROTECTED_ATTACHMENT_STORAGE_ENV = {
  ATTACHMENT_STORAGE_GLOBAL_MAX_BYTES: '5368709120',
  ATTACHMENT_STORAGE_PROJECT_MAX_BYTES: '1073741824',
  ATTACHMENT_STORAGE_ACTOR_MAX_BYTES: '536870912',
  ATTACHMENT_STORAGE_GLOBAL_MAX_OBJECTS: '5000',
  ATTACHMENT_STORAGE_PROJECT_MAX_OBJECTS: '1000',
  ATTACHMENT_STORAGE_ACTOR_MAX_OBJECTS: '500',
  ATTACHMENT_STORAGE_MIN_FREE_BYTES: '1073741824',
  ATTACHMENT_STORAGE_RESERVATION_TTL_MS: '7200000',
  ATTACHMENT_STORAGE_ACTOR_WINDOW_MS: '2592000000',
  ATTACHMENT_STORAGE_RECONCILE_INTERVAL_MS: '300000',
  ATTACHMENT_STORAGE_RECONCILE_BATCH_SIZE: '100',
  ATTACHMENT_STORAGE_RECONCILIATION_LEASE_MS: '300000',
  ATTACHMENT_STORAGE_RECONCILIATION_RETRY_MS: '300000',
  ATTACHMENT_STORAGE_PURGED_METADATA_RETENTION_MS: '7776000000',
} as const;

function createProtectedEnvironment(
  deploymentEnvironment: 'staging' | 'production',
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    DEPLOYMENT_ENV: deploymentEnvironment,
    ...PROTECTED_DATA_ENV,
    ...PROTECTED_SCANNER_ENV,
    ...PROTECTED_ATTACHMENT_STORAGE_ENV,
    ...(deploymentEnvironment === 'production'
      ? {
          FRONTEND_URL: 'https://timeline.all-too-well.com',
          FEISHU_REDIRECT_URI: 'https://timeline.all-too-well.com/login/callback',
          FEISHU_APP_ID: 'production-app',
          FEISHU_APP_SECRET: 'production-secret',
        }
      : {
          FRONTEND_URL: 'https://timeline.staging.internal',
          FEISHU_REDIRECT_URI: 'https://timeline.staging.internal/login/callback',
        }),
  };
}

describe('resolveAppConfig', () => {
  it('never treats example files as runtime configuration', () => {
    expect(APP_ENV_FILE_PATHS).toEqual(['.env.local', '.env']);
    expect(APP_ENV_FILE_PATHS).not.toContain('.env.example');
  });

  it('returns defaults when env is missing', () => {
    const config = resolveAppConfig({});

    expect(config.port).toBe(3001);
    expect(config.deploymentEnvironment).toBe('local');
    expect(config.sourceCommit).toBe('development');
    expect(config.sourceTree).toBe('development');
    expect(config.runtimeCommit).toBe('development');
    expect(config.buildTime).toBe('1970-01-01T00:00:00Z');
    expect(config.release).toBe('development');
    expect(config.frontendUrl).toBe('http://localhost:3000');
    expect(config.redisUrl).toBe('redis://localhost:6379');
    expect(config.notificationQueueEnabled).toBe(true);
    expect(config.notificationQueuePollMs).toBe(5000);
    expect(config.notificationOverdueScanMs).toBe(300000);
    expect(config.notificationMaxRetries).toBe(3);
    expect(config.notificationRedisQueueMaxJobs).toBe(2000);
    expect(config.notificationMemoryQueueMaxJobs).toBe(1000);
    expect(config.notificationMemoryDedupeMaxKeys).toBe(5000);
    expect(config.notificationJobMaxBytes).toBe(65536);
    expect(config.notificationScanBatchSize).toBe(100);
    expect(config.notificationScanMaxItems).toBe(1000);
    expect(config.authMockEnabled).toBe(false);
    expect(config.sessionCookieName).toBe('ft_session');
    expect(config.objectStorageProvider).toBe('local');
    expect(config.objectStorageLocalRoot).toBe('var/object-storage');
    expect(config.attachmentStorageGlobalMaxBytes).toBe(5368709120);
    expect(config.attachmentStorageProjectMaxBytes).toBe(1073741824);
    expect(config.attachmentStorageActorMaxBytes).toBe(536870912);
    expect(config.attachmentStorageGlobalMaxObjects).toBe(5000);
    expect(config.attachmentStorageProjectMaxObjects).toBe(1000);
    expect(config.attachmentStorageActorMaxObjects).toBe(500);
    expect(config.attachmentStorageMinFreeBytes).toBe(1073741824);
    expect(config.attachmentStorageReservationTtlMs).toBe(7200000);
    expect(config.malwareScannerProvider).toBe('local-eicar');
    expect(config.malwareScannerHost).toBe('');
    expect(config.malwareScannerPort).toBe(3310);
    expect(config.malwareScannerTimeoutMs).toBe(15000);
    expect(config.uploadAdmissionGlobalLimit).toBe(4);
    expect(config.uploadAdmissionPerActorLimit).toBe(2);
    expect(config.uploadAdmissionPerTargetLimit).toBe(3);
    expect(config.uploadAdmissionRateMaxRequests).toBe(6);
    expect(config.uploadAdmissionRateWindowMs).toBe(60000);
    expect(config.feishuOauthOverallTimeoutMs).toBe(10000);
    expect(config.feishuOauthMaxConcurrentRequests).toBe(8);
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

  it('accepts only bounded Feishu OAuth outbound resource controls', () => {
    expect(
      resolveAppConfig({
        FEISHU_OAUTH_OVERALL_TIMEOUT_MS: '1000',
        FEISHU_OAUTH_MAX_CONCURRENT_REQUESTS: '1',
      }),
    ).toMatchObject({
      feishuOauthOverallTimeoutMs: 1000,
      feishuOauthMaxConcurrentRequests: 1,
    });

    expect(
      resolveAppConfig({
        FEISHU_OAUTH_OVERALL_TIMEOUT_MS: '30000',
        FEISHU_OAUTH_MAX_CONCURRENT_REQUESTS: '64',
      }),
    ).toMatchObject({
      feishuOauthOverallTimeoutMs: 30000,
      feishuOauthMaxConcurrentRequests: 64,
    });

    for (const [name, value] of [
      ['FEISHU_OAUTH_OVERALL_TIMEOUT_MS', '999'],
      ['FEISHU_OAUTH_OVERALL_TIMEOUT_MS', '30001'],
      ['FEISHU_OAUTH_OVERALL_TIMEOUT_MS', 'not-an-integer'],
      ['FEISHU_OAUTH_MAX_CONCURRENT_REQUESTS', '0'],
      ['FEISHU_OAUTH_MAX_CONCURRENT_REQUESTS', '65'],
      ['FEISHU_OAUTH_MAX_CONCURRENT_REQUESTS', '1.5'],
    ] as const) {
      expect(() => resolveAppConfig({ [name]: value })).toThrowError(name);
    }
  });

  it('exposes only non-sensitive release identity metadata', () => {
    const immutableIdentity: BuildIdentity = {
      sourceCommit: '123456789abcdef0123456789abcdef012345678',
      sourceTree: 'abcdef0123456789abcdef0123456789abcdef01',
      buildTime: '2026-07-25T13:30:00Z',
      release: 'r26-admin-controls',
    };
    const config = resolveAppConfigImplementation(
      {
        RUNTIME_COMMIT: 'ffffffffffffffffffffffffffffffffffffffff',
        BUILD_TIME: '2099-01-01T00:00:00Z',
        RELEASE: 'runtime-spoof',
      },
      immutableIdentity,
    );

    expect(config.sourceCommit).toBe(immutableIdentity.sourceCommit);
    expect(config.sourceTree).toBe(immutableIdentity.sourceTree);
    expect(config.runtimeCommit).toBe(immutableIdentity.sourceCommit);
    expect(config.buildTime).toBe(immutableIdentity.buildTime);
    expect(config.release).toBe(immutableIdentity.release);
  });

  it('accepts a protected deployment only when immutable and expected identities match', () => {
    const config = resolveAppConfigImplementation(
      {
        ...createProtectedEnvironment('staging'),
        ...TEST_PROTECTED_EXPECTED_IDENTITY_ENV,
      },
      TEST_PROTECTED_BUILD_IDENTITY,
    );

    expect(config).toMatchObject({
      deploymentEnvironment: 'staging',
      sourceCommit: TEST_PROTECTED_BUILD_IDENTITY.sourceCommit,
      sourceTree: TEST_PROTECTED_BUILD_IDENTITY.sourceTree,
      runtimeCommit: TEST_PROTECTED_BUILD_IDENTITY.sourceCommit,
      release: TEST_PROTECTED_BUILD_IDENTITY.release,
      buildTime: TEST_PROTECTED_BUILD_IDENTITY.buildTime,
    });
  });

  it('fails protected startup when the generated development identity is not replaced', () => {
    expect(() =>
      resolveAppConfigImplementation({
        ...createProtectedEnvironment('staging'),
        ...TEST_PROTECTED_EXPECTED_IDENTITY_ENV,
      }),
    ).toThrowError(/Immutable build identity\.sourceCommit/);
  });

  it('fails protected startup when immutable and expected identities differ', () => {
    expect(() =>
      resolveAppConfigImplementation(
        {
          ...createProtectedEnvironment('production'),
          ...TEST_PROTECTED_EXPECTED_IDENTITY_ENV,
          EXPECTED_RELEASE: 'r27rc1-other',
        },
        TEST_PROTECTED_BUILD_IDENTITY,
      ),
    ).toThrowError(/EXPECTED_RELEASE/);
  });

  it('rejects a local deployment declaration under production NODE_ENV', () => {
    expect(() =>
      resolveAppConfigImplementation(
        {
          NODE_ENV: 'production',
          DEPLOYMENT_ENV: 'local',
        },
        LOCAL_DEVELOPMENT_BUILD_IDENTITY,
      ),
    ).toThrowError(/DEPLOYMENT_ENV=local/);
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
        ...PROTECTED_DATA_ENV,
        ...PROTECTED_SCANNER_ENV,
      }),
    ).toThrowError('AUTH_MOCK_ENABLED must be false in staging and production.');
  });

  it.each(['staging', 'production'] as const)(
    'refuses mock auth when DEPLOYMENT_ENV=%s even if NODE_ENV is development',
    (deploymentEnvironment) => {
      expect(() =>
        resolveAppConfig({
          ...createProtectedEnvironment(deploymentEnvironment),
          NODE_ENV: 'development',
          AUTH_MOCK_ENABLED: 'true',
        }),
      ).toThrowError(/AUTH_MOCK_ENABLED/);
    },
  );

  it.each(['staging', 'production'] as const)(
    'requires NODE_ENV=production when DEPLOYMENT_ENV=%s',
    (deploymentEnvironment) => {
      expect(() =>
        resolveAppConfig({
          ...createProtectedEnvironment(deploymentEnvironment),
          NODE_ENV: 'development',
        }),
      ).toThrowError(/NODE_ENV must be production/);
    },
  );

  it('pins production OAuth to the approved HTTPS callback and credentials', () => {
    expect(() =>
      resolveAppConfig({
        ...createProtectedEnvironment('production'),
        FEISHU_REDIRECT_URI: 'https://attacker.example/callback',
      }),
    ).toThrowError('FEISHU_REDIRECT_URI must be the approved production callback.');

    expect(
      resolveAppConfig(
        createProtectedEnvironment('production'),
      ).feishuRedirectUri,
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
      ...createProtectedEnvironment('staging'),
      FRONTEND_URL: 'http://localhost:8080',
      FEISHU_REDIRECT_URI: 'http://localhost:8080/login/callback',
    });

    expect(config.deploymentEnvironment).toBe('staging');
    expect(config.oauthProvider).toBe('feishu-cn');
  });

  it('rejects incomplete or non-production production identity configuration', () => {
    expect(() =>
      resolveAppConfig({
        ...createProtectedEnvironment('production'),
        FRONTEND_URL: 'http://timeline.all-too-well.com',
        FEISHU_REDIRECT_URI: 'http://timeline.all-too-well.com/login/callback',
      }),
    ).toThrowError(
      'FRONTEND_URL must be https://timeline.all-too-well.com in production.',
    );

    expect(() =>
      resolveAppConfig({
        NODE_ENV: 'production',
        DEPLOYMENT_ENV: 'production',
        ...PROTECTED_DATA_ENV,
        ...PROTECTED_SCANNER_ENV,
        FRONTEND_URL: 'https://timeline.all-too-well.com',
        FEISHU_REDIRECT_URI: 'https://timeline.all-too-well.com/login/callback',
      }),
    ).toThrowError('Feishu production credentials must be configured.');

    expect(() =>
      resolveAppConfig({
        NODE_ENV: 'production',
        DEPLOYMENT_ENV: 'production',
        ...PROTECTED_DATA_ENV,
        ...PROTECTED_SCANNER_ENV,
        FRONTEND_URL: 'https://timeline.all-too-well.com',
        FEISHU_REDIRECT_URI: 'https://timeline.all-too-well.com/login/callback',
        FEISHU_APP_ID: 'your_feishu_app_id',
        FEISHU_APP_SECRET: 'your_feishu_app_secret',
      }),
    ).toThrowError('Feishu production credentials must be configured.');
  });

  it.each(['staging', 'production'] as const)(
    'fails closed when %s database or Redis configuration is missing',
    (deploymentEnvironment) => {
      expect(() =>
        resolveAppConfig({
          ...createProtectedEnvironment(deploymentEnvironment),
          DATABASE_URL: undefined,
        }),
      ).toThrowError(/DATABASE_URL/);

      expect(() =>
        resolveAppConfig({
          ...createProtectedEnvironment(deploymentEnvironment),
          REDIS_URL: '   ',
        }),
      ).toThrowError(/REDIS_URL/);
    },
  );

  it('requires an explicit valid staging frontend origin', () => {
    expect(() =>
      resolveAppConfig({
        ...createProtectedEnvironment('staging'),
        FRONTEND_URL: undefined,
      }),
    ).toThrowError(/FRONTEND_URL/);

    expect(() =>
      resolveAppConfig({
        ...createProtectedEnvironment('staging'),
        FRONTEND_URL: 'http://staging.example.internal',
      }),
    ).toThrowError(/FRONTEND_URL/);
  });

  it.each(['staging', 'production'] as const)(
    'requires a real ClamAV adapter in %s',
    (deploymentEnvironment) => {
      expect(() =>
        resolveAppConfig({
          ...createProtectedEnvironment(deploymentEnvironment),
          MALWARE_SCANNER_PROVIDER: 'local-eicar',
        }),
      ).toThrowError(/MALWARE_SCANNER_PROVIDER/);

      expect(() =>
        resolveAppConfig({
          ...createProtectedEnvironment(deploymentEnvironment),
          CLAMAV_HOST: '   ',
        }),
      ).toThrowError(/CLAMAV_HOST/);

      expect(() =>
        resolveAppConfig({
          ...createProtectedEnvironment(deploymentEnvironment),
          CLAMAV_HOST: 'replace-with-approved-clamav-host',
        }),
      ).toThrowError(/CLAMAV_HOST/);

      expect(() =>
        resolveAppConfig({
          ...createProtectedEnvironment(deploymentEnvironment),
          CLAMAV_HOST: 'localhost',
        }),
      ).toThrowError(/CLAMAV_HOST/);
    },
  );

  it('rejects unsupported scanner providers and invalid ClamAV limits', () => {
    expect(() =>
      resolveAppConfig({ MALWARE_SCANNER_PROVIDER: 'allow-all' }),
    ).toThrowError(/MALWARE_SCANNER_PROVIDER/);
    expect(() =>
      resolveAppConfig({
        MALWARE_SCANNER_PROVIDER: 'clamav',
        CLAMAV_HOST: 'clamav',
        CLAMAV_PORT: '0',
      }),
    ).toThrowError(/CLAMAV_PORT/);
    expect(() =>
      resolveAppConfig({
        MALWARE_SCANNER_PROVIDER: 'clamav',
        CLAMAV_HOST: 'clamav',
        CLAMAV_TIMEOUT_MS: '999999',
      }),
    ).toThrowError(/CLAMAV_TIMEOUT_MS/);
  });

  it('fails closed for unsupported object-storage providers and invalid quota hierarchies', () => {
    expect(() =>
      resolveAppConfig({ OBJECT_STORAGE_PROVIDER: 's3' }),
    ).toThrowError(/OBJECT_STORAGE_PROVIDER/);

    expect(() =>
      resolveAppConfig({
        ATTACHMENT_STORAGE_GLOBAL_MAX_BYTES: '2000000',
        ATTACHMENT_STORAGE_PROJECT_MAX_BYTES: '3000000',
      }),
    ).toThrowError(/ATTACHMENT_STORAGE_PROJECT_MAX_BYTES/);

    expect(() =>
      resolveAppConfig({
        ATTACHMENT_STORAGE_GLOBAL_MAX_OBJECTS: '100',
        ATTACHMENT_STORAGE_PROJECT_MAX_OBJECTS: '101',
      }),
    ).toThrowError(/ATTACHMENT_STORAGE_PROJECT_MAX_OBJECTS/);

    expect(() =>
      resolveAppConfig({
        CLAMAV_TIMEOUT_MS: '60000',
        ATTACHMENT_STORAGE_RESERVATION_TTL_MS: '300000',
      }),
    ).toThrowError(/ATTACHMENT_STORAGE_RESERVATION_TTL_MS/);
  });

  it('requires explicit attachment storage budgets in protected environments', () => {
    expect(() =>
      resolveAppConfig({
        ...createProtectedEnvironment('staging'),
        ATTACHMENT_STORAGE_GLOBAL_MAX_BYTES: undefined,
      }),
    ).toThrowError(/ATTACHMENT_STORAGE_GLOBAL_MAX_BYTES/);
  });

  it('bounds upload admission concurrency and forbids a per-actor limit above the global limit', () => {
    expect(
      resolveAppConfig({
        UPLOAD_ADMISSION_GLOBAL_LIMIT: '4',
        UPLOAD_ADMISSION_PER_ACTOR_LIMIT: '4',
        UPLOAD_ADMISSION_PER_TARGET_LIMIT: '4',
        UPLOAD_ADMISSION_RATE_MAX_REQUESTS: '12',
        UPLOAD_ADMISSION_RATE_WINDOW_MS: '30000',
      }),
    ).toMatchObject({
      uploadAdmissionGlobalLimit: 4,
      uploadAdmissionPerActorLimit: 4,
      uploadAdmissionPerTargetLimit: 4,
      uploadAdmissionRateMaxRequests: 12,
      uploadAdmissionRateWindowMs: 30000,
    });

    for (const env of [
      { UPLOAD_ADMISSION_GLOBAL_LIMIT: '0' },
      { UPLOAD_ADMISSION_GLOBAL_LIMIT: '5' },
      { UPLOAD_ADMISSION_PER_ACTOR_LIMIT: '0' },
      { UPLOAD_ADMISSION_PER_ACTOR_LIMIT: '5' },
      { UPLOAD_ADMISSION_PER_TARGET_LIMIT: '0' },
      { UPLOAD_ADMISSION_PER_TARGET_LIMIT: '5' },
      { UPLOAD_ADMISSION_RATE_MAX_REQUESTS: '0' },
      { UPLOAD_ADMISSION_RATE_MAX_REQUESTS: '61' },
      { UPLOAD_ADMISSION_RATE_WINDOW_MS: '999' },
      { UPLOAD_ADMISSION_RATE_WINDOW_MS: '300001' },
      {
        UPLOAD_ADMISSION_GLOBAL_LIMIT: '2',
        UPLOAD_ADMISSION_PER_ACTOR_LIMIT: '3',
      },
    ]) {
      expect(() => resolveAppConfig(env)).toThrowError(/UPLOAD_ADMISSION/);
    }
  });

  it('bounds download admission and forbids actor or target limits above global', () => {
    expect(
      resolveAppConfig({
        DOWNLOAD_ADMISSION_GLOBAL_LIMIT: '8',
        DOWNLOAD_ADMISSION_PER_ACTOR_LIMIT: '3',
        DOWNLOAD_ADMISSION_PER_TARGET_LIMIT: '4',
        DOWNLOAD_ADMISSION_RATE_MAX_REQUESTS: '24',
        DOWNLOAD_ADMISSION_RATE_WINDOW_MS: '30000',
      }),
    ).toMatchObject({
      downloadAdmissionGlobalLimit: 8,
      downloadAdmissionPerActorLimit: 3,
      downloadAdmissionPerTargetLimit: 4,
      downloadAdmissionRateMaxRequests: 24,
      downloadAdmissionRateWindowMs: 30000,
    });

    for (const env of [
      { DOWNLOAD_ADMISSION_GLOBAL_LIMIT: '0' },
      { DOWNLOAD_ADMISSION_GLOBAL_LIMIT: '33' },
      { DOWNLOAD_ADMISSION_PER_ACTOR_LIMIT: '0' },
      { DOWNLOAD_ADMISSION_PER_ACTOR_LIMIT: '9' },
      { DOWNLOAD_ADMISSION_PER_TARGET_LIMIT: '0' },
      { DOWNLOAD_ADMISSION_PER_TARGET_LIMIT: '9' },
      { DOWNLOAD_ADMISSION_RATE_MAX_REQUESTS: '0' },
      { DOWNLOAD_ADMISSION_RATE_MAX_REQUESTS: '121' },
      { DOWNLOAD_ADMISSION_RATE_WINDOW_MS: '999' },
      { DOWNLOAD_ADMISSION_RATE_WINDOW_MS: '300001' },
      {
        DOWNLOAD_ADMISSION_GLOBAL_LIMIT: '2',
        DOWNLOAD_ADMISSION_PER_ACTOR_LIMIT: '3',
      },
      {
        DOWNLOAD_ADMISSION_GLOBAL_LIMIT: '2',
        DOWNLOAD_ADMISSION_PER_TARGET_LIMIT: '3',
      },
    ]) {
      expect(() => resolveAppConfig(env)).toThrowError(/DOWNLOAD_ADMISSION/);
    }
  });

  it('strictly bounds notification fallback and scan resource controls', () => {
    expect(
      resolveAppConfig({
        NOTIFICATION_MEMORY_QUEUE_MAX_JOBS: '200',
        NOTIFICATION_REDIS_QUEUE_MAX_JOBS: '2000',
        NOTIFICATION_MEMORY_DEDUPE_MAX_KEYS: '600',
        NOTIFICATION_JOB_MAX_BYTES: '32768',
        NOTIFICATION_SCAN_BATCH_SIZE: '50',
        NOTIFICATION_SCAN_MAX_ITEMS: '250',
      }),
    ).toMatchObject({
      notificationMemoryQueueMaxJobs: 200,
      notificationRedisQueueMaxJobs: 2000,
      notificationMemoryDedupeMaxKeys: 600,
      notificationJobMaxBytes: 32768,
      notificationScanBatchSize: 50,
      notificationScanMaxItems: 250,
    });

    for (const env of [
      { NOTIFICATION_QUEUE_POLL_MS: '99' },
      { NOTIFICATION_QUEUE_POLL_MS: '60001' },
      { NOTIFICATION_OVERDUE_SCAN_MS: '999' },
      { NOTIFICATION_OVERDUE_SCAN_MS: '86400001' },
      { NOTIFICATION_RETRY_DELAY_MS: '-1' },
      { NOTIFICATION_RETRY_DELAY_MS: '3600001' },
      { NOTIFICATION_MAX_RETRIES: '0' },
      { NOTIFICATION_MAX_RETRIES: '21' },
      { NOTIFICATION_REDIS_QUEUE_MAX_JOBS: '0' },
      { NOTIFICATION_REDIS_QUEUE_MAX_JOBS: '100001' },
      { NOTIFICATION_MEMORY_QUEUE_MAX_JOBS: '0' },
      { NOTIFICATION_MEMORY_QUEUE_MAX_JOBS: '100001' },
      { NOTIFICATION_MEMORY_DEDUPE_MAX_KEYS: '0' },
      { NOTIFICATION_MEMORY_DEDUPE_MAX_KEYS: '200001' },
      { NOTIFICATION_JOB_MAX_BYTES: '1023' },
      { NOTIFICATION_JOB_MAX_BYTES: '1048577' },
      { NOTIFICATION_SCAN_BATCH_SIZE: '0' },
      { NOTIFICATION_SCAN_BATCH_SIZE: '1001' },
      { NOTIFICATION_SCAN_MAX_ITEMS: '0' },
      { NOTIFICATION_SCAN_MAX_ITEMS: '10001' },
      {
        NOTIFICATION_SCAN_BATCH_SIZE: '100',
        NOTIFICATION_SCAN_MAX_ITEMS: '50',
      },
      {
        NOTIFICATION_MEMORY_QUEUE_MAX_JOBS: '1000',
        NOTIFICATION_JOB_MAX_BYTES: '1048576',
      },
    ]) {
      expect(() => resolveAppConfig(env)).toThrowError(/NOTIFICATION_/);
    }
  });

  it('caps both serialized notification queue budgets at 128 MiB', () => {
    expect(
      resolveAppConfig({
        NOTIFICATION_MEMORY_QUEUE_MAX_JOBS: '128',
        NOTIFICATION_REDIS_QUEUE_MAX_JOBS: '2048',
        NOTIFICATION_JOB_MAX_BYTES: '65536',
      }),
    ).toMatchObject({
      notificationMemoryQueueMaxJobs: 128,
      notificationRedisQueueMaxJobs: 2048,
      notificationJobMaxBytes: 65536,
    });

    expect(() =>
      resolveAppConfig({
        NOTIFICATION_REDIS_QUEUE_MAX_JOBS: '2049',
        NOTIFICATION_JOB_MAX_BYTES: '65536',
      }),
    ).toThrowError(
      /NOTIFICATION_REDIS_QUEUE_MAX_JOBS.*NOTIFICATION_JOB_MAX_BYTES/,
    );
  });

  it('strictly bounds supplier catalog and persisted mutation admission', () => {
    expect(
      resolveAppConfig({
        SUPPLIER_CATALOG_MAX_ITEMS: '5000',
        SUPPLIER_MUTATION_MAX_REQUESTS: '30',
        SUPPLIER_MUTATION_WINDOW_MS: '3600000',
      }),
    ).toMatchObject({
      supplierCatalogMaxItems: 5000,
      supplierMutationMaxRequests: 30,
      supplierMutationWindowMs: 3600000,
    });

    for (const env of [
      { SUPPLIER_CATALOG_MAX_ITEMS: '99' },
      { SUPPLIER_CATALOG_MAX_ITEMS: '10001' },
      { SUPPLIER_MUTATION_MAX_REQUESTS: '0' },
      { SUPPLIER_MUTATION_MAX_REQUESTS: '1001' },
      { SUPPLIER_MUTATION_WINDOW_MS: '59999' },
      { SUPPLIER_MUTATION_WINDOW_MS: '86400001' },
    ]) {
      expect(() => resolveAppConfig(env)).toThrowError(/SUPPLIER_/);
    }
  });

  it.each([
    {
      name: 'local PostgreSQL',
      key: 'DATABASE_URL',
      value: 'postgresql://app_user:strong-password@localhost:5432/feishu_timeline',
    },
    {
      name: 'default PostgreSQL credentials',
      key: 'DATABASE_URL',
      value: 'postgresql://postgres:postgres@postgres:5432/feishu_timeline',
    },
    {
      name: 'placeholder PostgreSQL password',
      key: 'DATABASE_URL',
      value: 'postgresql://app_user:replace-with-strong-password@postgres:5432/feishu_timeline',
    },
    {
      name: 'local Redis',
      key: 'REDIS_URL',
      value: 'redis://:strong-password@127.0.0.1:6379',
    },
    {
      name: 'Redis without authentication',
      key: 'REDIS_URL',
      value: 'redis://redis:6379',
    },
    {
      name: 'placeholder Redis password',
      key: 'REDIS_URL',
      value: 'redis://:changeme@redis:6379',
    },
  ])('rejects $name in protected environments', ({ key, value }) => {
    expect(() =>
      resolveAppConfig({
        ...createProtectedEnvironment('staging'),
        [key]: value,
      }),
    ).toThrowError(new RegExp(key));
  });

  it.each(['staging', 'production'] as const)(
    'rejects short database and Redis passwords in %s',
    (deploymentEnvironment) => {
      expect(() =>
        resolveAppConfig({
          ...createProtectedEnvironment(deploymentEnvironment),
          DATABASE_URL:
            'postgresql://app_user:x@postgres:5432/feishu_timeline?schema=public',
        }),
      ).toThrowError(/DATABASE_URL/);

      expect(() =>
        resolveAppConfig({
          ...createProtectedEnvironment(deploymentEnvironment),
          REDIS_URL: 'redis://:x@redis:6379',
        }),
      ).toThrowError(/REDIS_URL/);
    },
  );

  it('maps NODE_ENV=staging to a protected staging deployment', () => {
    expect(() =>
      resolveAppConfig({
        NODE_ENV: 'staging',
      }),
    ).toThrowError(/DATABASE_URL/);

    expect(() =>
      resolveAppConfig({
        NODE_ENV: 'staging',
        ...PROTECTED_DATA_ENV,
        ...PROTECTED_SCANNER_ENV,
      }),
    ).toThrowError(/NODE_ENV must be production/);
  });

  it('rejects an unknown deployment environment instead of falling back to local', () => {
    expect(() =>
      resolveAppConfig({
        NODE_ENV: 'development',
        DEPLOYMENT_ENV: 'stageing',
      }),
    ).toThrowError('DEPLOYMENT_ENV must be local, staging, or production.');
  });

  it.each(['development', 'test'])(
    'retains explicit local defaults in %s',
    (nodeEnv) => {
      const config = resolveAppConfig({ NODE_ENV: nodeEnv });

      expect(config.databaseUrl).toContain('@localhost:5432/');
      expect(config.redisUrl).toBe('redis://localhost:6379');
    },
  );
});
