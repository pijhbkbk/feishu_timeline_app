import { describe, expect, it } from 'vitest';

import {
  assertCanonicalBuildIdentity,
  LOCAL_DEVELOPMENT_BUILD_IDENTITY,
  resolveBuildIdentityDeploymentEnvironment,
  resolveImmutableBuildIdentity,
  type BuildIdentity,
} from './build-identity';

const VALID_IDENTITY: BuildIdentity = Object.freeze({
  sourceCommit: '0123456789abcdef0123456789abcdef01234567',
  sourceTree: '89abcdef0123456789abcdef0123456789abcdef',
  release: 'r27rc1+20260904.1',
  buildTime: '2026-09-04T01:02:03Z',
});

const EXPECTED_ENV = {
  EXPECTED_SOURCE_COMMIT: VALID_IDENTITY.sourceCommit,
  EXPECTED_SOURCE_TREE: VALID_IDENTITY.sourceTree,
  EXPECTED_RELEASE: VALID_IDENTITY.release,
  EXPECTED_BUILD_TIME: VALID_IDENTITY.buildTime,
} as const;

describe('Web canonical build identity', () => {
  it('accepts the canonical schema and freezes its result', () => {
    const identity = assertCanonicalBuildIdentity(VALID_IDENTITY, {
      allowDevelopment: false,
    });

    expect(identity).toEqual(VALID_IDENTITY);
    expect(Object.isFrozen(identity)).toBe(true);
  });

  it.each([
    ['sourceCommit', ''],
    ['sourceCommit', '0123456789ab'],
    ['sourceCommit', '0123456789ABCDEF0123456789abcdef01234567'],
    ['sourceCommit', '0000000000000000000000000000000000000000'],
    ['sourceTree', '89abcdef0123'],
    ['sourceTree', '89ABCDEF0123456789abcdef0123456789abcdef'],
    ['sourceTree', '0000000000000000000000000000000000000000'],
  ] as const)('rejects invalid %s value %s', (field, value) => {
    expect(() =>
      assertCanonicalBuildIdentity(
        { ...VALID_IDENTITY, [field]: value },
        { allowDevelopment: false },
      ),
    ).toThrowError(field);
  });

  it.each([
    '',
    '2026-09-04',
    '2026-09-04T01:02:03+00:00',
    '2026-09-04T01:02:03.000Z',
    '2026-02-29T01:02:03Z',
    '2026-09-04T01:02:03Z\n',
  ])('rejects non-canonical build time %s', (buildTime) => {
    expect(() =>
      assertCanonicalBuildIdentity(
        { ...VALID_IDENTITY, buildTime },
        { allowDevelopment: false },
      ),
    ).toThrowError(/buildTime/);
  });

  it.each([
    '',
    '-leading-option',
    'contains space',
    'contains/slash',
    'contains;semicolon',
    'contains$(command)',
    `line\nbreak`,
    'a'.repeat(129),
    'unknown',
    'DEV',
    'local',
    'development',
    'latest',
    'release-placeholder',
    'replace_with_release',
  ])('rejects unsafe or reserved release %s', (release) => {
    expect(() =>
      assertCanonicalBuildIdentity(
        { ...VALID_IDENTITY, release },
        { allowDevelopment: false },
      ),
    ).toThrowError(/release/);
  });

  it('rejects non-canonical object shapes', () => {
    const missingTree: Record<string, unknown> = { ...VALID_IDENTITY };
    delete missingTree.sourceTree;

    expect(() =>
      assertCanonicalBuildIdentity(missingTree, { allowDevelopment: false }),
    ).toThrowError(/exactly/);
    expect(() =>
      assertCanonicalBuildIdentity(
        { ...VALID_IDENTITY, extra: 'not-allowed' },
        { allowDevelopment: false },
      ),
    ).toThrowError(/exactly/);
  });

  it('allows only the exact development sentinel in local mode', () => {
    expect(
      assertCanonicalBuildIdentity(LOCAL_DEVELOPMENT_BUILD_IDENTITY, {
        allowDevelopment: true,
      }),
    ).toBe(LOCAL_DEVELOPMENT_BUILD_IDENTITY);

    expect(() =>
      assertCanonicalBuildIdentity(LOCAL_DEVELOPMENT_BUILD_IDENTITY, {
        allowDevelopment: false,
      }),
    ).toThrowError(/sourceCommit/);
    expect(() =>
      assertCanonicalBuildIdentity(
        { ...LOCAL_DEVELOPMENT_BUILD_IDENTITY, buildTime: 'unknown' },
        { allowDevelopment: true },
      ),
    ).toThrowError(/sourceCommit/);
  });
});

describe('Web protected build identity boundary', () => {
  it.each([
    [{}, 'local'],
    [{ NODE_ENV: 'test' }, 'local'],
    [{ DEPLOYMENT_ENV: 'local', NODE_ENV: 'development' }, 'local'],
    [{ NODE_ENV: 'staging' }, 'staging'],
    [{ NODE_ENV: 'production' }, 'production'],
    [{ DEPLOYMENT_ENV: 'staging', NODE_ENV: 'production' }, 'staging'],
    [{ DEPLOYMENT_ENV: 'production', NODE_ENV: 'production' }, 'production'],
  ] as const)('resolves %o as %s', (env, expected) => {
    expect(resolveBuildIdentityDeploymentEnvironment(env)).toBe(expected);
  });

  it('rejects unknown and contradictory deployment environments', () => {
    expect(() =>
      resolveBuildIdentityDeploymentEnvironment({ NODE_ENV: 'release' }),
    ).toThrowError(/NODE_ENV/);
    expect(() =>
      resolveBuildIdentityDeploymentEnvironment({ DEPLOYMENT_ENV: 'stageing' }),
    ).toThrowError(/DEPLOYMENT_ENV/);
    expect(() =>
      resolveBuildIdentityDeploymentEnvironment({
        DEPLOYMENT_ENV: 'local',
        NODE_ENV: 'production',
      }),
    ).toThrowError(/not allowed/);
  });

  it('allows the explicit development identity only in local mode', () => {
    expect(
      resolveImmutableBuildIdentity(
        'local',
        {},
        LOCAL_DEVELOPMENT_BUILD_IDENTITY,
      ),
    ).toBe(LOCAL_DEVELOPMENT_BUILD_IDENTITY);
    expect(() =>
      resolveImmutableBuildIdentity(
        'production',
        EXPECTED_ENV,
        LOCAL_DEVELOPMENT_BUILD_IDENTITY,
      ),
    ).toThrowError(/sourceCommit/);
  });

  it.each(['staging', 'production'] as const)(
    'accepts exact immutable and expected identity in %s',
    (deploymentEnvironment) => {
      expect(
        resolveImmutableBuildIdentity(
          deploymentEnvironment,
          EXPECTED_ENV,
          VALID_IDENTITY,
        ),
      ).toEqual(VALID_IDENTITY);
    },
  );

  it.each([
    'EXPECTED_SOURCE_COMMIT',
    'EXPECTED_SOURCE_TREE',
    'EXPECTED_RELEASE',
    'EXPECTED_BUILD_TIME',
  ] as const)('fails closed when %s is missing', (name) => {
    const env = { ...EXPECTED_ENV } as Record<string, string | undefined>;
    delete env[name];

    expect(() =>
      resolveImmutableBuildIdentity('staging', env, VALID_IDENTITY),
    ).toThrowError(name);
  });

  it.each([
    ['EXPECTED_SOURCE_COMMIT', 'fedcba9876543210fedcba9876543210fedcba98'],
    ['EXPECTED_SOURCE_TREE', 'fedcba9876543210fedcba9876543210fedcba98'],
    ['EXPECTED_RELEASE', 'r27rc1-other'],
    ['EXPECTED_BUILD_TIME', '2026-09-04T01:02:04Z'],
  ] as const)('fails closed when %s mismatches', (name, value) => {
    expect(() =>
      resolveImmutableBuildIdentity(
        'production',
        { ...EXPECTED_ENV, [name]: value },
        VALID_IDENTITY,
      ),
    ).toThrowError(name);
  });

  it('does not treat legacy runtime variables as actual identity', () => {
    expect(() =>
      resolveImmutableBuildIdentity(
        'production',
        {
          RUNTIME_COMMIT: VALID_IDENTITY.sourceCommit,
          SOURCE_TREE: VALID_IDENTITY.sourceTree,
          RELEASE: VALID_IDENTITY.release,
          BUILD_TIME: VALID_IDENTITY.buildTime,
        },
        LOCAL_DEVELOPMENT_BUILD_IDENTITY,
      ),
    ).toThrowError(/sourceCommit/);
  });
});
