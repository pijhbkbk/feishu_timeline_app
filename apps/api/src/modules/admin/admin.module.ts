import { Module } from '@nestjs/common';

import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { AdminAuditLogsController } from './admin-audit-logs.controller';
import { AdminControlCenterController } from './admin-control-center.controller';
import { AdminControlCenterService } from './admin-control-center.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [ActivityLogsModule, WorkflowsModule],
  controllers: [
    AdminController,
    AdminAuditLogsController,
    AdminControlCenterController,
  ],
  providers: [AdminService, AdminControlCenterService],
})
export class AdminModule {}
