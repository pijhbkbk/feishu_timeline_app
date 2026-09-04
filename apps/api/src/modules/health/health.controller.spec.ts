import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { HealthController } from './health.controller';

const VALID_CONFIG = {
  nodeEnv: 'production',
  deploymentEnvironment: 'staging',
  sourceCommit: '0123456789abcdef0123456789abcdef01234567',
  sourceTree: '89abcdef0123456789abcdef0123456789abcdef',
  runtimeCommit: 'ffffffffffffffffffffffffffffffffffffffff',
  release: 'r27rc1-health-test',
  buildTime: '2026-09-04T01:02:03Z',
} as const;

function createController(values: Readonly<Record<string, unknown>>) {
  const configService = {
    get<T>(key: string): T | undefined {
      return values[key] as T | undefined;
    },
    getOrThrow<T>(key: string): T {
      const value = values[key];
      if (value === undefined) {
        throw new Error(`Missing configuration: ${key}`);
      }
      return value as T;
    },
  } as ConfigService;

  return new HealthController(configService);
}

describe('HealthController', () => {
  it('returns the canonical immutable identity and compatibility alias', () => {
    const result = createController(VALID_CONFIG).getHealth();

    expect(result).toEqual({
      status: 'ok',
      service: 'feishu-timeline-api',
      nodeEnv: 'production',
      sourceCommit: VALID_CONFIG.sourceCommit,
      sourceTree: VALID_CONFIG.sourceTree,
      runtimeCommit: VALID_CONFIG.sourceCommit,
      release: VALID_CONFIG.release,
      buildTime: VALID_CONFIG.buildTime,
      timestamp: expect.any(String),
    });
    expect(result.runtimeCommit).not.toBe(VALID_CONFIG.runtimeCommit);
  });

  it.each(['sourceCommit', 'sourceTree', 'release', 'buildTime'])(
    'fails closed when %s is missing',
    (field) => {
      const values: Record<string, unknown> = { ...VALID_CONFIG };
      delete values[field];

      expect(() => createController(values).getHealth()).toThrowError(field);
    },
  );

  it.each([
    ['sourceCommit', '0123456789ab'],
    ['sourceTree', '89ABCDEF0123456789abcdef0123456789abcdef'],
    ['release', 'latest'],
    ['buildTime', '2026-09-04T01:02:03.000Z'],
  ] as const)('fails closed when %s is malformed', (field, value) => {
    expect(() =>
      createController({ ...VALID_CONFIG, [field]: value }).getHealth(),
    ).toThrowError(field);
  });

  it('allows the explicit generated development identity only in local mode', () => {
    const developmentConfig = {
      deploymentEnvironment: 'local',
      nodeEnv: 'test',
      sourceCommit: 'development',
      sourceTree: 'development',
      release: 'development',
      buildTime: '1970-01-01T00:00:00Z',
    };

    expect(createController(developmentConfig).getHealth()).toMatchObject({
      sourceCommit: 'development',
      sourceTree: 'development',
      runtimeCommit: 'development',
      release: 'development',
    });
    expect(() =>
      createController({
        ...developmentConfig,
        deploymentEnvironment: 'production',
      }).getHealth(),
    ).toThrowError(/sourceCommit/);
  });
});
