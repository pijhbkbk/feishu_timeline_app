import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkflowAction } from '@prisma/client';

import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SaveWorkflowTaskFormDto } from './dto/save-workflow-task-form.dto';
import { WorkflowActionDto } from './dto/workflow-action.dto';
import { WorkflowsService } from './workflows.service';

@ApiTags('workflows')
@ApiCookieAuth('ft_session')
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Permissions('project.read')
  @ApiOperation({ summary: '获取项目流程图' })
  @Get('projects/:projectId')
  getProjectWorkflow(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.workflowsService.getProjectWorkflow(projectId, actor);
  }

  @Permissions('project.read')
  @ApiOperation({ summary: '获取项目流程时间线' })
  @Get('projects/:projectId/timeline')
  getProjectWorkflowTimeline(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.workflowsService.getWorkflowTimeline(projectId, actor);
  }

  @Permissions('project.read')
  @ApiOperation({ summary: '获取第 17 步月度评审总览' })
  @Get('projects/:projectId/monthly-reviews')
  getMonthlyReviewWorkspace(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.workflowsService.getMonthlyReviewWorkspace(projectId, actor);
  }

  @Permissions('project.read')
  @ApiOperation({ summary: '获取单个月度评审周期详情' })
  @Get('projects/:projectId/monthly-reviews/:recurringTaskId')
  getMonthlyReviewTaskDetail(
    @Param('projectId') projectId: string,
    @Param('recurringTaskId') recurringTaskId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.workflowsService.getMonthlyReviewTaskDetail(projectId, recurringTaskId, actor);
  }

  @Permissions('project.read')
  @ApiOperation({ summary: '获取节点任务详情' })
  @Get('tasks/:taskId')
  getTaskDetail(@Param('taskId') taskId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.workflowsService.getTaskDetail(taskId, actor);
  }

  @Permissions('project.read')
  @ApiOperation({ summary: '获取节点历史轮次' })
  @Get('tasks/:taskId/history-rounds')
  getTaskHistoryRounds(
    @Param('taskId') taskId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.workflowsService.getTaskRoundHistory(taskId, actor);
  }

  @Permissions('workflow.transition')
  @ApiOperation({
    summary: '保存节点表单草稿',
    description: '覆盖保存任务 payload.formData，用于前端草稿暂存；重复调用会覆盖同一任务的当前草稿。',
  })
  @Put('tasks/:taskId/form')
  saveTaskForm(
    @Param('taskId') taskId: string,
    @Body() body: SaveWorkflowTaskFormDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.workflowsService.saveTaskForm(taskId, actor, body);
  }

  @Permissions('workflow.transition')
  @ApiOperation({
    summary: '开始节点任务',
    description: '重复提交会被当前任务状态校验拦截，不会重复生成新节点。',
  })
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
    @Body() body: WorkflowActionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.workflowsService.transitionTask(taskId, WorkflowAction.START, actor, body);
  }

  @Permissions('workflow.transition')
  @ApiOperation({
    summary: '提交节点任务',
    description: '流程流转由后端控制；重复提交会被任务状态和活跃节点唯一性约束拦截。',
  })
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
    @Body() body: WorkflowActionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.workflowsService.transitionTask(taskId, WorkflowAction.SUBMIT, actor, body);
  }

  @Permissions('workflow.transition')
  @ApiOperation({
    summary: '通过节点任务',
    description: '流程推进依赖后端状态机；重复通过不会重复创建同节点活跃任务。',
  })
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
    @Body() body: WorkflowActionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.workflowsService.transitionTask(taskId, WorkflowAction.APPROVE, actor, body);
  }

  @Permissions('workflow.transition')
  @ApiOperation({
    summary: '驳回节点任务',
    description: '驳回会按既定退回规则生成新轮次；重复提交会被状态校验拦截。',
  })
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
    @Body() body: WorkflowActionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.workflowsService.transitionTask(taskId, WorkflowAction.REJECT, actor, body);
  }

  @Permissions('workflow.transition')
  @ApiOperation({
    summary: '退回节点任务',
    description: '退回目标节点由后端校验并生成新轮次；重复提交不会重复生成活跃任务。',
  })
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
    @Body() body: WorkflowActionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.workflowsService.transitionTask(taskId, WorkflowAction.RETURN, actor, body);
  }

  @Permissions('workflow.transition')
  @ApiOperation({
    summary: '完成节点任务',
    description: '完成动作受任务状态控制，并依赖活跃节点唯一性防止重复推进。',
  })
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
    @Body() body: WorkflowActionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.workflowsService.transitionTask(taskId, WorkflowAction.COMPLETE, actor, body);
  }
}
