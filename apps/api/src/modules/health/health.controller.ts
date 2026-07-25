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
      runtimeCommit: this.configService.get<string>('runtimeCommit') ?? 'unknown',
      buildTime: this.configService.get<string>('buildTime') ?? 'unknown',
      release: this.configService.get<string>('release') ?? 'development',
      timestamp: new Date().toISOString(),
    };
  }
}
