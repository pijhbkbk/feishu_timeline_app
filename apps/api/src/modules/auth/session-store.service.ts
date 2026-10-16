import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';

import { RedisService } from '../../infra/redis/redis.service';

type MemoryEntry = {
  value: string;
  expiresAt: number;
};

export const AUTH_MEMORY_STORE_MAX_ENTRIES = 512;

const AUTH_RATE_LIMIT_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

@Injectable()
export class SessionStoreService {
  private readonly logger = new Logger(SessionStoreService.name);
  private readonly memoryStore = new Map<string, MemoryEntry>();
  private hasLoggedRedisFallback = false;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async setJson<T>(key: string, value: T, ttlSeconds: number) {
    this.validateKey(key);
    const serialized = JSON.stringify(value);
    if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > 4_096) {
      throw new ServiceUnavailableException('认证存储数据超出限制。');
    }
    const client = await this.getRedisClient();

    if (client) {
      await this.redisService.execute((redis) => redis.set(key, serialized, 'EX', ttlSeconds));
      return;
    }

    this.writeMemoryEntry(key, serialized, ttlSeconds);
  }

  async getJson<T>(key: string): Promise<T | null> {
    this.validateKey(key);
    const client = await this.getRedisClient();

    if (client) {
      const value = await this.redisService.execute((redis) => redis.get(key));
      return value ? (JSON.parse(value) as T) : null;
    }

    const entry = this.memoryStore.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.memoryStore.delete(key);
      return null;
    }

    return JSON.parse(entry.value) as T;
  }

  async consumeJson<T>(key: string): Promise<T | null> {
    this.validateKey(key);
    const client = await this.getRedisClient();

    if (client) {
      const result = await this.redisService.execute((redis) =>
        redis.multi().get(key).del(key).exec(),
      );
      if (!result || result.length !== 2 || result.some(([error]) => error !== null)) {
        throw new ServiceUnavailableException('认证服务暂时不可用，请稍后重试。');
      }
      const value = result?.[0]?.[1];

      return typeof value === 'string' ? (JSON.parse(value) as T) : null;
    }

    const entry = this.memoryStore.get(key);
    this.memoryStore.delete(key);

    if (!entry || entry.expiresAt <= Date.now()) {
      return null;
    }

    return JSON.parse(entry.value) as T;
  }

  async delete(key: string) {
    this.validateKey(key);
    const client = await this.getRedisClient();

    if (client) {
      await this.redisService.execute((redis) => redis.del(key));
      return;
    }

    this.memoryStore.delete(key);
  }

  async incrementWithTtl(key: string, ttlSeconds: number) {
    this.validateKey(key);
    const client = await this.getRedisClient();

    if (client) {
      const result = await this.redisService.execute((redis) =>
        redis.eval(AUTH_RATE_LIMIT_LUA, 1, key, String(ttlSeconds)),
      );
      const count = Number(result);

      if (!Number.isSafeInteger(count) || count < 1) {
        throw new ServiceUnavailableException('认证限流服务暂时不可用。');
      }

      return count;
    }

    this.cleanupExpiredMemoryEntries();
    const currentEntry = this.memoryStore.get(key);
    const currentCount = currentEntry ? Number(JSON.parse(currentEntry.value)) : 0;
    const nextCount = Number.isSafeInteger(currentCount) && currentCount >= 0
      ? currentCount + 1
      : 1;
    this.writeMemoryEntry(key, JSON.stringify(nextCount), ttlSeconds);

    return nextCount;
  }

  private validateKey(key: string) {
    if (typeof key !== 'string' || Buffer.byteLength(key, 'utf8') > 256) {
      throw new ServiceUnavailableException('认证存储数据超出限制。');
    }
  }

  private async getRedisClient(): Promise<Redis | null> {
    const client = this.redisService.getClient();

    if (client.status === 'ready') {
      return client;
    }

    if (client.status === 'wait') {
      try {
        await client.connect();
        return client;
      } catch {
        return this.handleRedisUnavailable();
      }
    }

    if (client.status === 'connecting') {
      return this.handleRedisUnavailable();
    }

    return this.handleRedisUnavailable();
  }

  private handleRedisUnavailable(): null {
    if (this.isProduction()) {
      throw new ServiceUnavailableException('认证服务暂时不可用，请稍后重试。');
    }

    this.logRedisFallback();
    return null;
  }

  private writeMemoryEntry(key: string, value: string, ttlSeconds: number) {
    this.cleanupExpiredMemoryEntries();

    if (!this.memoryStore.has(key) && this.memoryStore.size >= AUTH_MEMORY_STORE_MAX_ENTRIES) {
      throw new ServiceUnavailableException('本地认证存储容量已达上限，请稍后重试。');
    }

    this.memoryStore.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  private cleanupExpiredMemoryEntries(now = Date.now()) {
    for (const [key, entry] of this.memoryStore) {
      if (entry.expiresAt <= now) {
        this.memoryStore.delete(key);
      }
    }
  }

  private isProduction() {
    const nodeEnv =
      this.configService.get<string>('nodeEnv') ?? process.env.NODE_ENV ?? 'development';

    return nodeEnv.trim().toLowerCase() === 'production';
  }

  private logRedisFallback() {
    if (this.hasLoggedRedisFallback) {
      return;
    }

    this.hasLoggedRedisFallback = true;

    this.logger.warn('eventType=auth_session_store result=memory_fallback');
  }
}
