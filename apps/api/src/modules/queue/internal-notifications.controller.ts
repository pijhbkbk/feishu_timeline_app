import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import { NotificationType } from '@prisma/client';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import { NotificationQueueService } from './notification-queue.service';

@Controller('internal/notifications')
export class InternalNotificationsController {
  constructor(private readonly notificationQueueService: NotificationQueueService) {}

  @Roles('admin')
  @Permissions('system.manage')
  @Post('enqueue')
  enqueue(
    @Body() body: Record<string, unknown>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.notificationQueueService.enqueue({
      type: (body.type as NotificationType | undefined) ?? NotificationType.SYSTEM_INFO,
      taskId: typeof body.taskId === 'string' ? body.taskId : null,
      projectId: typeof body.projectId === 'string' ? body.projectId : null,
      userId: typeof body.userId === 'string' ? body.userId : actor.id,
      title: typeof body.title === 'string' ? body.title : '系统提醒',
      content: typeof body.content === 'string' ? body.content : '你有一条新的系统提醒。',
      linkPath: typeof body.linkPath === 'string' ? body.linkPath : null,
      triggeredByUserId: actor.id,
      metadata: body.metadata === undefined ? undefined : JSON.parse(JSON.stringify(body.metadata)),
    });
  }

  @Roles('admin')
  @Permissions('system.manage')
  @Post('process-due-reminder-scan')
  processDueReminderScan() {
    return this.notificationQueueService.processDueReminderScan();
  }

  @Roles('admin')
  @Permissions('system.manage')
  @Post('process-overdue-scan')
  processOverdueScan() {
    return this.notificationQueueService.processOverdueScan();
  }

  @Roles('admin')
  @Permissions('system.manage')
  @Post('process-monthly-review-schedule')
  processMonthlyReviewSchedule() {
    return this.notificationQueueService.processMonthlyReviewSchedule();
  }
}
