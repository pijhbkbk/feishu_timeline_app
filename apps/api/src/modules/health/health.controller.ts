import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Public } from '../auth/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly configService: ConfigService) {}

  @Public()
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'feishu-timeline-api',
      nodeEnv: this.configService.get<string>('nodeEnv') ?? 'development',
      timestamp: new Date().toISOString(),
    };
  }
}
