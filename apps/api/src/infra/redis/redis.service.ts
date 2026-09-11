import { Inject, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private activeOperations = 0;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('redisUrl') ?? 'redis://localhost:6379';

    this.client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      autoResendUnfulfilledCommands: false,
      connectTimeout: 5_000,
      commandTimeout: 5_000,
      socketTimeout: 10_000,
    });
  }

  getClient() {
    return this.client;
  }

  async execute<T>(handler: (client: Redis) => Promise<T>) {
    // Admit whole business operations before dispatch, never part of a transaction.
    // A timed-out command can still occupy ioredis' physical reply queue.
    if (this.activeOperations >= 32 || this.client.commandQueue.length >= 64) {
      throw new ServiceUnavailableException('服务繁忙，请稍后重试。');
    }
    this.activeOperations += 1;
    try {
      if (this.client.status === 'wait') {
        await this.client.connect();
      }
      return await handler(this.client);
    } finally {
      this.activeOperations -= 1;
    }
  }

  async onModuleDestroy() {
    if (this.client.status === 'end') {
      return;
    }

    await this.client.quit();
  }
}
