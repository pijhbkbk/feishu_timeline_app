import { ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisMock = vi.hoisted(() => ({
  status: 'ready',
  commandQueue: { length: 0 },
  connect: vi.fn(),
  quit: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock('ioredis', () => ({ default: vi.fn(function () { return redisMock; }) }));
import Redis from 'ioredis';
import { RedisService } from './redis.service';

function createService() {
  return new RedisService({ get: () => 'redis://localhost:6379' } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  redisMock.status = 'ready';
  redisMock.commandQueue.length = 0;
});

describe('Redis admission', () => {
  it('rejects excess concurrent operations before dispatch and recovers capacity', async () => {
    const service = createService();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const operations = Array.from({ length: 32 }, () => service.execute(() => pending));
    const overflow = vi.fn().mockResolvedValue('unexpected');
    await expect(service.execute(overflow)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(overflow).not.toHaveBeenCalled();
    release();
    await Promise.all(operations);
    await expect(service.execute(async () => 'recovered')).resolves.toBe('recovered');
  });

  it('counts physically pending replies even after callers have timed out', async () => {
    const service = createService();
    redisMock.commandQueue.length = 64;
    const transaction = vi.fn().mockResolvedValue('unexpected');
    await expect(service.execute(transaction)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(transaction).not.toHaveBeenCalled();
    redisMock.commandQueue.length = 0;
    await expect(service.execute(async () => 'recovered')).resolves.toBe('recovered');
  });

  it('releases admission after a failed handler', async () => {
    const service = createService();
    for (let i = 0; i < 64; i += 1) {
      await expect(service.execute(async () => { throw new Error('failed'); })).rejects.toThrow('failed');
    }
    await expect(service.execute(async () => 'recovered')).resolves.toBe('recovered');
  });

  it('sets deadlines without automatically resending uncertain writes', () => {
    createService();
    expect(Redis).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({
      commandTimeout: 5000,
      connectTimeout: 5000,
      socketTimeout: 10000,
      autoResendUnfulfilledCommands: false,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    }));
  });
});
