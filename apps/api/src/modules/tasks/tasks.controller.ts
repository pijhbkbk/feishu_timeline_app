import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('my')
  getMyTasks(
    @Query() query: Record<string, string | undefined>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.getMyTasks(query, actor);
  }

  @Get('pending')
  getPendingTasks(
    @Query() query: Record<string, string | undefined>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.getPendingTasks(query, actor);
  }

  @Get('overdue')
  getOverdueTasks(
    @Query() query: Record<string, string | undefined>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.getOverdueTasks(query, actor);
  }

  @Get(':taskId')
  getTaskDetail(
    @Param('taskId') taskId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.getTaskDetail(taskId, actor);
  }
}

