import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessionStoreService } from '../../modules/auth/session-store.service';
import { RedisService } from './redis.service';

const url = process.env.REDIS_SECURITY_TEST_URL;
// This test requires its own disposable Redis; never accepts a remote hostname.
describe.skipIf(!url)('isolated Redis admission integration', () => {
  let control: Redis;
  let service: RedisService;
  let sessions: SessionStoreService;
  beforeAll(async () => {
    const target = new URL(url!);
    if (target.hostname !== '127.0.0.1' || !target.password || target.port === '6379') {
      throw new Error('A password-protected disposable loopback Redis port is required');
    }
    const config = new ConfigService({ redisUrl: url, nodeEnv: 'production' });
    control = new Redis(url!, { connectTimeout: 5000, commandTimeout: 10000 });
    service = new RedisService(config);
    await service.getClient().connect();
    sessions = new SessionStoreService(service, config);
  });
  afterAll(async () => {
    service?.getClient().disconnect();
    control?.disconnect();
  });

  it('preserves authenticated session, one-use consumption and normal queue operations', async () => {
    const key = 'auth:state:isolated-admission';
    await sessions.setJson(key, { state: 'synthetic' }, 60);
    expect(await sessions.getJson(key)).toEqual({ state: 'synthetic' });
    const results = await Promise.all([sessions.consumeJson(key), sessions.consumeJson(key)]);
    expect(results.filter(Boolean)).toEqual([{ state: 'synthetic' }]);
    expect(await sessions.getJson(key)).toBeNull();
    expect(await sessions.incrementWithTtl('auth:rate:isolated', 60)).toBe(1);
    expect(await sessions.incrementWithTtl('auth:rate:isolated', 60)).toBe(2);
    await service.execute((client) => client.lpush('notifications:isolated', 'first'));
    await service.execute((client) => client.lpush('notifications:isolated', 'second'));
    expect(await service.execute((client) => client.rpop('notifications:isolated'))).toBe('first');
    expect(await service.execute((client) => client.rpop('notifications:isolated'))).toBe('second');
  });

  it('bounds caller wait while retaining accounting for an uncertain pending write', async () => {
    await control.call('CLIENT', 'PAUSE', '6500', 'ALL');
    const started = Date.now();
    await expect(service.execute((client) => client.incr('deadline:synthetic')))
      .rejects.toThrow('Command timed out');
    expect(Date.now() - started).toBeLessThan(6200);
    expect(service.getClient().commandQueue.length).toBeGreaterThan(0);
    // The command may execute after the caller times out. Never retry it automatically.
    expect(await control.get('deadline:synthetic')).toBe('1');
    expect(await service.execute((client) => client.ping())).toBe('PONG');
  }, 15000);

  it('reconnects after an isolated connection interruption', async () => {
    const client = service.getClient();
    const reconnected = new Promise<void>((resolve) => client.once('ready', resolve));
    client.disconnect(true);
    await reconnected;
    expect(await service.execute((redis) => redis.ping())).toBe('PONG');
    expect(client.options.autoResendUnfulfilledCommands).toBe(false);
  }, 10000);
});
