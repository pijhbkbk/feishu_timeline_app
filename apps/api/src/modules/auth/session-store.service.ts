import { Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';

import { RedisService } from '../../infra/redis/redis.service';

type MemoryEntry = {
  value: string;
  expiresAt: number;
};

@Injectable()
export class SessionStoreService {
  private readonly logger = new Logger(SessionStoreService.name);
  private readonly memoryStore = new Map<string, MemoryEntry>();
  private hasLoggedRedisFallback = false;

  constructor(private readonly redisService: RedisService) {}

  async setJson<T>(key: string, value: T, ttlSeconds: number) {
    const serialized = JSON.stringify(value);
    const client = await this.getRedisClient();

    if (client) {
      await client.set(key, serialized, 'EX', ttlSeconds);
      return;
    }

    this.memoryStore.set(key, {
      value: serialized,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
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

  async delete(key: string) {
    const client = await this.getRedisClient();

    if (client) {
      await client.del(key);
      return;
    }

    this.memoryStore.delete(key);
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
        this.logRedisFallback(error);
        return null;
      }
    }

    if (client.status === 'connecting') {
      return null;
    }

    this.logRedisFallback();
    return null;
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
