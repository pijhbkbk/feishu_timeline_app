import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  assertCanonicalBuildIdentity,
  type BuildIdentityDeploymentEnvironment,
} from '../../common/build-identity';
import { Public } from '../auth/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly configService: ConfigService) {}

  @Public()
  @Get()
  getHealth() {
    const deploymentEnvironment =
      this.configService.getOrThrow<BuildIdentityDeploymentEnvironment>(
        'deploymentEnvironment',
      );
    const identity = assertCanonicalBuildIdentity(
      {
        sourceCommit: this.configService.getOrThrow<string>('sourceCommit'),
        sourceTree: this.configService.getOrThrow<string>('sourceTree'),
        release: this.configService.getOrThrow<string>('release'),
        buildTime: this.configService.getOrThrow<string>('buildTime'),
      },
      {
        allowDevelopment: deploymentEnvironment === 'local',
        label: 'Configured build identity',
      },
    );

    return {
      status: 'ok',
      service: 'feishu-timeline-api',
      nodeEnv: this.configService.get<string>('nodeEnv') ?? 'development',
      sourceCommit: identity.sourceCommit,
      sourceTree: identity.sourceTree,
      runtimeCommit: identity.sourceCommit,
      release: identity.release,
      buildTime: identity.buildTime,
      timestamp: new Date().toISOString(),
    };
  }
}
