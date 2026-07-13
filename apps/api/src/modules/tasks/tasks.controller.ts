import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import { CreateTaskProgressDto } from './dto/create-task-progress.dto';
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

  @Get('review')
  getReviewTasks(
    @Query() query: Record<string, string | undefined>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.getReviewTasks(query, actor);
  }

  @Get('due-soon')
  getDueSoonTasks(
    @Query() query: Record<string, string | undefined>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.getDueSoonTasks(query, actor);
  }

  @Get('completed')
  getCompletedTasks(
    @Query() query: Record<string, string | undefined>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.getCompletedTasks(query, actor);
  }

  @Permissions('project.read')
  @ApiOperation({ summary: '获取任务进展历史' })
  @Get(':taskId/progress')
  getTaskProgress(
    @Param('taskId') taskId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.getTaskProgress(taskId, actor);
  }

  @Permissions('workflow.transition')
  @ApiOperation({ summary: '提交一条不可覆盖的任务进展记录' })
  @Post(':taskId/progress')
  createTaskProgress(
    @Param('taskId') taskId: string,
    @Body() body: CreateTaskProgressDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.createTaskProgress(taskId, body, actor);
  }

  @Get(':taskId')
  getTaskDetail(
    @Param('taskId') taskId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.getTaskDetail(taskId, actor);
  }
}
