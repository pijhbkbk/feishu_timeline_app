import { Module } from '@nestjs/common';

import { AdminAuditLogsController } from './admin-audit-logs.controller';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  controllers: [AdminController, AdminAuditLogsController],
  providers: [AdminService],
})
export class AdminModule {}
