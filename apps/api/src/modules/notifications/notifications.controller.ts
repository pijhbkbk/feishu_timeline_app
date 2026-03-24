import {
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('my')
  getMyNotifications(
    @Query() query: Record<string, string | undefined>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.notificationsService.getMyNotifications(query, actor);
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser() actor: AuthenticatedUser) {
    return this.notificationsService.getUnreadCount(actor);
  }

  @Post(':notificationId/mark-read')
  markRead(
    @Param('notificationId') notificationId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.notificationsService.markRead(notificationId, actor);
  }

  @Post('mark-all-read')
  markAllRead(@CurrentUser() actor: AuthenticatedUser) {
    return this.notificationsService.markAllRead(actor);
  }
}

