import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(configService: ConfigService) {
    const redisUrl = configService.get<string>('redisUrl') ?? 'redis://localhost:6379';

    this.client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  }

  getClient() {
    return this.client;
  }

  async execute<T>(handler: (client: Redis) => Promise<T>) {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }

    return handler(this.client);
  }

  async onModuleDestroy() {
    if (this.client.status === 'end') {
      return;
    }

    await this.client.quit();
  }
}
