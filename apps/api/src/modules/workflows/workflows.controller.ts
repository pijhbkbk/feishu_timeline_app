import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { WorkflowAction } from '@prisma/client';

import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { WorkflowsService } from './workflows.service';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get('projects/:projectId')
  getProjectWorkflow(@Param('projectId') projectId: string) {
    return this.workflowsService.getProjectWorkflow(projectId);
  }

  @Get('projects/:projectId/timeline')
  getProjectWorkflowTimeline(@Param('projectId') projectId: string) {
    return this.workflowsService.getWorkflowTimeline(projectId);
  }

  @Roles(
    'admin',
    'project_manager',
    'process_engineer',
    'quality_engineer',
    'purchaser',
    'reviewer',
    'finance',
  )
  @Post('tasks/:taskId/start')
  startTask(
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.workflowsService.transitionTask(taskId, WorkflowAction.START, actor, body);
  }

  @Roles(
    'admin',
    'project_manager',
    'process_engineer',
    'quality_engineer',
    'purchaser',
    'reviewer',
    'finance',
  )
  @Post('tasks/:taskId/submit')
  submitTask(
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.workflowsService.transitionTask(taskId, WorkflowAction.SUBMIT, actor, body);
  }

  @Roles(
    'admin',
    'project_manager',
    'process_engineer',
    'quality_engineer',
    'purchaser',
    'reviewer',
    'finance',
  )
  @Post('tasks/:taskId/approve')
  approveTask(
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.workflowsService.transitionTask(taskId, WorkflowAction.APPROVE, actor, body);
  }

  @Roles(
    'admin',
    'project_manager',
    'process_engineer',
    'quality_engineer',
    'purchaser',
    'reviewer',
    'finance',
  )
  @Post('tasks/:taskId/reject')
  rejectTask(
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.workflowsService.transitionTask(taskId, WorkflowAction.REJECT, actor, body);
  }

  @Roles(
    'admin',
    'project_manager',
    'process_engineer',
    'quality_engineer',
    'purchaser',
    'reviewer',
    'finance',
  )
  @Post('tasks/:taskId/return')
  returnTask(
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.workflowsService.transitionTask(taskId, WorkflowAction.RETURN, actor, body);
  }

  @Roles(
    'admin',
    'project_manager',
    'process_engineer',
    'quality_engineer',
    'purchaser',
    'reviewer',
    'finance',
  )
  @Post('tasks/:taskId/complete')
  completeTask(
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.workflowsService.transitionTask(taskId, WorkflowAction.COMPLETE, actor, body);
  }
}
