import { IMMUTABLE_BUILD_IDENTITY } from './build-identity.generated';

export type BuildIdentity = Readonly<{
  sourceCommit: string;
  sourceTree: string;
  release: string;
  buildTime: string;
}>;

export type BuildIdentityDeploymentEnvironment =
  | 'local'
  | 'staging'
  | 'production';

type BuildIdentityEnvironment = Readonly<
  Record<string, string | undefined>
>;

const BUILD_IDENTITY_FIELDS = [
  'sourceCommit',
  'sourceTree',
  'release',
  'buildTime',
] as const satisfies readonly (keyof BuildIdentity)[];

const EXPECTED_ENV_BY_FIELD = {
  sourceCommit: 'EXPECTED_SOURCE_COMMIT',
  sourceTree: 'EXPECTED_SOURCE_TREE',
  release: 'EXPECTED_RELEASE',
  buildTime: 'EXPECTED_BUILD_TIME',
} as const satisfies Record<keyof BuildIdentity, string>;

const FULL_LOWERCASE_GIT_OBJECT_ID = /^[0-9a-f]{40}$/;
const ZERO_GIT_OBJECT_ID = /^0{40}$/;
const SAFE_RELEASE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;
const CANONICAL_UTC_TIMESTAMP =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/;
const FORBIDDEN_RELEASES = new Set([
  'unknown',
  'dev',
  'local',
  'development',
  'latest',
]);
const PLACEHOLDER_RELEASE = /(?:placeholder|replace[-_]?with|replace[-_]?me)/i;

export const LOCAL_DEVELOPMENT_BUILD_IDENTITY: BuildIdentity = Object.freeze({
  sourceCommit: 'development',
  sourceTree: 'development',
  release: 'development',
  buildTime: '1970-01-01T00:00:00Z',
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readIdentity(value: unknown, label: string): BuildIdentity {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }

  const keys = Object.keys(value).sort();
  const expectedKeys = [...BUILD_IDENTITY_FIELDS].sort();
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(
      `${label} must contain exactly sourceCommit, sourceTree, release, and buildTime.`,
    );
  }

  for (const field of BUILD_IDENTITY_FIELDS) {
    if (typeof value[field] !== 'string') {
      throw new Error(`${label}.${field} must be a string.`);
    }
  }

  return {
    sourceCommit: value.sourceCommit as string,
    sourceTree: value.sourceTree as string,
    release: value.release as string,
    buildTime: value.buildTime as string,
  };
}

function isCanonicalUtcTimestamp(value: string) {
  if (!CANONICAL_UTC_TIMESTAMP.test(value)) {
    return false;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.toISOString().replace('.000Z', 'Z') === value;
}

function isExplicitDevelopmentIdentity(identity: BuildIdentity) {
  return BUILD_IDENTITY_FIELDS.every(
    (field) => identity[field] === LOCAL_DEVELOPMENT_BUILD_IDENTITY[field],
  );
}

export function assertCanonicalBuildIdentity(
  value: unknown,
  options: Readonly<{
    allowDevelopment: boolean;
    label?: string;
  }>,
): BuildIdentity {
  const label = options.label ?? 'Build identity';
  const identity = readIdentity(value, label);

  if (options.allowDevelopment && isExplicitDevelopmentIdentity(identity)) {
    return LOCAL_DEVELOPMENT_BUILD_IDENTITY;
  }

  if (
    !FULL_LOWERCASE_GIT_OBJECT_ID.test(identity.sourceCommit) ||
    ZERO_GIT_OBJECT_ID.test(identity.sourceCommit)
  ) {
    throw new Error(
      `${label}.sourceCommit must be a complete non-placeholder lowercase 40-hex value.`,
    );
  }

  if (
    !FULL_LOWERCASE_GIT_OBJECT_ID.test(identity.sourceTree) ||
    ZERO_GIT_OBJECT_ID.test(identity.sourceTree)
  ) {
    throw new Error(
      `${label}.sourceTree must be a complete non-placeholder lowercase 40-hex value.`,
    );
  }

  if (
    !SAFE_RELEASE.test(identity.release) ||
    FORBIDDEN_RELEASES.has(identity.release.toLowerCase()) ||
    PLACEHOLDER_RELEASE.test(identity.release)
  ) {
    throw new Error(
      `${label}.release must be a safe release identifier between 1 and 128 characters.`,
    );
  }

  if (!isCanonicalUtcTimestamp(identity.buildTime)) {
    throw new Error(`${label}.buildTime must be a canonical UTC timestamp.`);
  }

  return Object.freeze({ ...identity });
}

export function resolveBuildIdentityDeploymentEnvironment(
  env: BuildIdentityEnvironment,
): BuildIdentityDeploymentEnvironment {
  const nodeEnvironment = env.NODE_ENV?.trim().toLowerCase() || 'development';
  const configuredEnvironment = env.DEPLOYMENT_ENV?.trim().toLowerCase();

  if (
    nodeEnvironment !== 'development' &&
    nodeEnvironment !== 'test' &&
    nodeEnvironment !== 'local' &&
    nodeEnvironment !== 'staging' &&
    nodeEnvironment !== 'production'
  ) {
    throw new Error(
      'NODE_ENV must be development, test, local, staging, or production.',
    );
  }

  if (
    configuredEnvironment !== undefined &&
    configuredEnvironment !== '' &&
    configuredEnvironment !== 'local' &&
    configuredEnvironment !== 'staging' &&
    configuredEnvironment !== 'production'
  ) {
    throw new Error('DEPLOYMENT_ENV must be local, staging, or production.');
  }

  if (configuredEnvironment === 'local') {
    if (nodeEnvironment === 'staging' || nodeEnvironment === 'production') {
      throw new Error(
        'DEPLOYMENT_ENV=local is not allowed when NODE_ENV is staging or production.',
      );
    }
    return 'local';
  }

  if (
    configuredEnvironment === 'staging' ||
    configuredEnvironment === 'production'
  ) {
    return configuredEnvironment;
  }

  if (nodeEnvironment === 'staging' || nodeEnvironment === 'production') {
    return nodeEnvironment;
  }

  return 'local';
}

function readExpectedIdentity(env: BuildIdentityEnvironment): BuildIdentity {
  const expectedValues: Record<string, string> = {};

  for (const field of BUILD_IDENTITY_FIELDS) {
    const environmentName = EXPECTED_ENV_BY_FIELD[field];
    const value = env[environmentName];
    if (value === undefined || value === '') {
      throw new Error(
        `${environmentName} must be explicitly configured in staging and production.`,
      );
    }
    expectedValues[field] = value;
  }

  return assertCanonicalBuildIdentity(expectedValues, {
    allowDevelopment: false,
    label: 'Expected build identity',
  });
}

export function resolveImmutableBuildIdentity(
  deploymentEnvironment: BuildIdentityDeploymentEnvironment,
  env: BuildIdentityEnvironment,
  immutableIdentity: unknown = IMMUTABLE_BUILD_IDENTITY,
): BuildIdentity {
  const isProtectedEnvironment =
    deploymentEnvironment === 'staging' ||
    deploymentEnvironment === 'production';
  const actual = assertCanonicalBuildIdentity(immutableIdentity, {
    allowDevelopment: !isProtectedEnvironment,
    label: 'Immutable build identity',
  });

  if (!isProtectedEnvironment) {
    return actual;
  }

  const expected = readExpectedIdentity(env);
  for (const field of BUILD_IDENTITY_FIELDS) {
    if (actual[field] !== expected[field]) {
      throw new Error(
        `Immutable build identity does not match ${EXPECTED_ENV_BY_FIELD[field]}.`,
      );
    }
  }

  return actual;
}
