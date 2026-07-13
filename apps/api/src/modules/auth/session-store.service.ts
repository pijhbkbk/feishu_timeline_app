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
    const serialized = JSON.stringify(value);
    const client = await this.getRedisClient();

    if (client) {
      await client.set(key, serialized, 'EX', ttlSeconds);
      return;
    }

    this.writeMemoryEntry(key, serialized, ttlSeconds);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const client = await this.getRedisClient();

    if (client) {
      const value = await client.get(key);
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
    const client = await this.getRedisClient();

    if (client) {
      const result = await client.multi().get(key).del(key).exec();
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
    const client = await this.getRedisClient();

    if (client) {
      await client.del(key);
      return;
    }

    this.memoryStore.delete(key);
  }

  async incrementWithTtl(key: string, ttlSeconds: number) {
    const client = await this.getRedisClient();

    if (client) {
      const result = await client.eval(
        AUTH_RATE_LIMIT_LUA,
        1,
        key,
        String(ttlSeconds),
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

  private async getRedisClient(): Promise<Redis | null> {
    const client = this.redisService.getClient();

    if (client.status === 'ready') {
      return client;
    }

    if (client.status === 'wait') {
      try {
        await client.connect();
        return client;
      } catch (error) {
        return this.handleRedisUnavailable(error);
      }
    }

    if (client.status === 'connecting') {
      return this.handleRedisUnavailable();
    }

    return this.handleRedisUnavailable();
  }

  private handleRedisUnavailable(error?: unknown): null {
    if (this.isProduction()) {
      throw new ServiceUnavailableException('认证服务暂时不可用，请稍后重试。');
    }

    this.logRedisFallback(error);
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

  private logRedisFallback(error?: unknown) {
    if (this.hasLoggedRedisFallback) {
      return;
    }

    this.hasLoggedRedisFallback = true;

    this.logger.warn(
      `Redis unavailable, auth sessions fall back to memory store.${error instanceof Error ? ` ${error.message}` : ''}`,
    );
  }
}
