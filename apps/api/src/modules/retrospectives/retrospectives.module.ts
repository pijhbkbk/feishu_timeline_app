import { Module } from '@nestjs/common';

import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AuthModule } from '../auth/auth.module';
import { RetrospectivesController } from './retrospectives.controller';
import { RetrospectivesService } from './retrospectives.service';

@Module({
  imports: [AuthModule, ActivityLogsModule],
  controllers: [RetrospectivesController],
  providers: [RetrospectivesService],
})
export class RetrospectivesModule {}
