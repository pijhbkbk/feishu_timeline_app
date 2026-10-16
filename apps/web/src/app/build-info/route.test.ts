import { describe, expect, it } from 'vitest';

import {
  createBuildInfoPayload,
  LOCAL_DEVELOPMENT_BUILD_IDENTITY,
  type BuildIdentity,
} from '../../lib/build-identity';
import { GET } from './route';

const VALID_IDENTITY: BuildIdentity = Object.freeze({
  sourceCommit: '0123456789abcdef0123456789abcdef01234567',
  sourceTree: '89abcdef0123456789abcdef0123456789abcdef',
  release: 'r27rc1-route-test',
  buildTime: '2026-09-04T01:02:03Z',
});

const PROTECTED_ENV = {
  NODE_ENV: 'production',
  DEPLOYMENT_ENV: 'staging',
  EXPECTED_SOURCE_COMMIT: VALID_IDENTITY.sourceCommit,
  EXPECTED_SOURCE_TREE: VALID_IDENTITY.sourceTree,
  EXPECTED_RELEASE: VALID_IDENTITY.release,
  EXPECTED_BUILD_TIME: VALID_IDENTITY.buildTime,
} as const;

describe('GET /build-info', () => {
  it('exposes the same canonical immutable fields and compatibility alias', () => {
    expect(createBuildInfoPayload(PROTECTED_ENV, VALID_IDENTITY)).toEqual({
      service: 'feishu-timeline-web',
      sourceCommit: VALID_IDENTITY.sourceCommit,
      sourceTree: VALID_IDENTITY.sourceTree,
      runtimeCommit: VALID_IDENTITY.sourceCommit,
      release: VALID_IDENTITY.release,
      buildTime: VALID_IDENTITY.buildTime,
    });
  });

  it('does not let runtime metadata variables replace the immutable identity', () => {
    const payload = createBuildInfoPayload(
      {
        ...PROTECTED_ENV,
        RUNTIME_COMMIT: 'ffffffffffffffffffffffffffffffffffffffff',
        SOURCE_TREE: 'ffffffffffffffffffffffffffffffffffffffff',
        RELEASE: 'runtime-spoof',
        BUILD_TIME: '2099-01-01T00:00:00Z',
      },
      VALID_IDENTITY,
    );

    expect(payload.sourceCommit).toBe(VALID_IDENTITY.sourceCommit);
    expect(payload.sourceTree).toBe(VALID_IDENTITY.sourceTree);
    expect(payload.release).toBe(VALID_IDENTITY.release);
    expect(payload.buildTime).toBe(VALID_IDENTITY.buildTime);
  });

  it('fails closed when a protected expected value is missing or mismatched', () => {
    const missingExpectedTree: NodeJS.ProcessEnv = { ...PROTECTED_ENV };
    delete missingExpectedTree.EXPECTED_SOURCE_TREE;

    expect(() =>
      createBuildInfoPayload(missingExpectedTree, VALID_IDENTITY),
    ).toThrowError(/EXPECTED_SOURCE_TREE/);
    expect(() =>
      createBuildInfoPayload(
        { ...PROTECTED_ENV, EXPECTED_RELEASE: 'r27rc1-other' },
        VALID_IDENTITY,
      ),
    ).toThrowError(/EXPECTED_RELEASE/);
  });

  it('returns no-store JSON without leaking expected identity variables', async () => {
    const response = GET();

    expect(response.headers.get('Cache-Control')).toBe('no-store, max-age=0');
    const payload = await response.json();
    expect(payload).toEqual({
      service: 'feishu-timeline-web',
      sourceCommit: LOCAL_DEVELOPMENT_BUILD_IDENTITY.sourceCommit,
      sourceTree: LOCAL_DEVELOPMENT_BUILD_IDENTITY.sourceTree,
      runtimeCommit: LOCAL_DEVELOPMENT_BUILD_IDENTITY.sourceCommit,
      release: LOCAL_DEVELOPMENT_BUILD_IDENTITY.release,
      buildTime: LOCAL_DEVELOPMENT_BUILD_IDENTITY.buildTime,
    });
    expect(JSON.stringify(payload)).not.toContain('EXPECTED_');
  });
});
