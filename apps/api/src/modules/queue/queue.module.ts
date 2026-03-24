import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { InternalNotificationsController } from './internal-notifications.controller';
import { NotificationQueueService } from './notification-queue.service';

@Module({
  imports: [NotificationsModule],
  controllers: [InternalNotificationsController],
  providers: [NotificationQueueService],
  exports: [NotificationQueueService],
})
export class QueueModule {}

