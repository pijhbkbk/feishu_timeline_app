import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_MEMORY_STORE_MAX_ENTRIES,
  SessionStoreService,
} from './session-store.service';

function createService(options: { nodeEnv?: string; redisStatus?: string } = {}) {
  const redisClient = {
    status: options.redisStatus ?? 'end',
    connect: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    multi: vi.fn(),
    eval: vi.fn(),
  };
  const redisService = {
    getClient: vi.fn(() => redisClient),
  };
  const configService = {
    get: vi.fn((key: string) =>
      key === 'nodeEnv' ? options.nodeEnv ?? 'development' : undefined,
    ),
  };

  return {
    service: new SessionStoreService(redisService as never, configService as never),
    redisClient,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('SessionStoreService security boundaries', () => {
  it('fails closed instead of allocating memory when Redis is unavailable in production', async () => {
    const { service } = createService({ nodeEnv: 'production', redisStatus: 'end' });

    await expect(service.setJson('session:test', { userId: 'user-1' }, 60)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('bounds the development fallback store and reclaims expired entries', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T00:00:00.000Z'));
    const { service } = createService();

    for (let index = 0; index < AUTH_MEMORY_STORE_MAX_ENTRIES; index += 1) {
      await service.setJson(`state:${index}`, { index }, 1);
    }

    await expect(service.setJson('state:overflow', {}, 1)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    vi.advanceTimersByTime(1_001);
    await expect(service.setJson('state:after-expiry', {}, 1)).resolves.toBeUndefined();
  });

  it('keeps fallback rate counters bounded by their TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T00:00:00.000Z'));
    const { service } = createService();

    await expect(service.incrementWithTtl('rate:test', 60)).resolves.toBe(1);
    await expect(service.incrementWithTtl('rate:test', 60)).resolves.toBe(2);

    vi.advanceTimersByTime(60_001);
    await expect(service.incrementWithTtl('rate:test', 60)).resolves.toBe(1);
  });

  it('uses one atomic Redis script for production rate counters', async () => {
    const { service, redisClient } = createService({
      nodeEnv: 'production',
      redisStatus: 'ready',
    });
    redisClient.eval.mockResolvedValue(1);

    await expect(service.incrementWithTtl('rate:test', 60)).resolves.toBe(1);
    expect(redisClient.eval).toHaveBeenCalledWith(expect.any(String), 1, 'rate:test', '60');
  });
});
