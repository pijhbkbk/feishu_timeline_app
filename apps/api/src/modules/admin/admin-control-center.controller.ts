import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkflowNodeCode } from '@prisma/client';
import type { Response } from 'express';

import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AdminControlCenterService } from './admin-control-center.service';
import {
  AdminAssignmentChangeDto,
  AdminAssignmentPreviewDto,
  AdminBatchTaskChangeDto,
  AdminBatchTaskPreviewDto,
  AdminDictionaryChangeDto,
  AdminLedgerQueryDto,
  AdminNodeAssignmentChangeDto,
  AdminNodeAssignmentPreviewDto,
  AdminOrganizationQueryDto,
  AdminProjectBasicInfoDto,
  AdminSavedViewDto,
  AdminSavedViewQueryDto,
  AdminScheduleChangeDto,
  AdminSchedulePreviewDto,
  AdminTaskScheduleImportDto,
  AdminTaskScheduleImportPreviewDto,
  AdminTemplateVersionDto,
  AdminUserStatusChangeDto,
} from './dto/admin-control-center.dto';

@ApiTags('admin-control-center')
@ApiCookieAuth('ft_session')
@Roles('admin')
@Permissions('system.manage')
@Controller('admin')
export class AdminControlCenterController {
  constructor(private readonly service: AdminControlCenterService) {}

  @ApiOperation({ summary: '后台项目总台账' })
  @Get('projects')
  listProjects(@Query() query: AdminLedgerQueryDto) {
    return this.service.listProjects(query);
  }

  @ApiOperation({ summary: '后台工序总台账' })
  @Get('tasks')
  listTasks(@Query() query: AdminLedgerQueryDto) {
    return this.service.listTasks(query);
  }

  @ApiOperation({ summary: '导出当前筛选工序，文本已防公式注入' })
  @Get('tasks/export')
  async exportTasks(
    @Query() query: AdminLedgerQueryDto,
    @Res() response: Response,
  ) {
    const csv = await this.service.exportTasksCsv(query);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent('工序总台账.csv')}`,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(csv);
  }

  @ApiOperation({ summary: '下载工序计划日期正式导入模板' })
  @Get('tasks/import-template')
  getTaskScheduleImportTemplate(@Res() response: Response) {
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent('工序计划日期导入模板.csv')}`,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(this.service.getTaskScheduleImportTemplate());
  }

  @ApiOperation({ summary: '工序计划日期导入预检，不写入' })
  @Post('tasks/import-preview')
  previewTaskScheduleImport(@Body() body: AdminTaskScheduleImportPreviewDto) {
    return this.service.previewTaskScheduleImport(body);
  }

  @ApiOperation({ summary: '确认应用通过预检的工序计划日期导入' })
  @Post('tasks/import')
  applyTaskScheduleImport(
    @Body() body: AdminTaskScheduleImportDto,
    @Headers('idempotency-key') headerKey: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    this.assertIdempotencyKey(body.idempotencyKey, headerKey);
    return this.service.applyTaskScheduleImport(
      body,
      actor,
      requestId?.trim() || body.idempotencyKey,
    );
  }

  @ApiOperation({ summary: '组织、用户与项目成员台账' })
  @Get('organization')
  getOrganization(@Query() query: AdminOrganizationQueryDto) {
    return this.service.getOrganization(query);
  }

  @ApiOperation({ summary: '18 节点分工矩阵' })
  @Get('assignments')
  getAssignments(@Query('projectId') projectId?: string) {
    return this.service.getAssignments(projectId);
  }

  @ApiOperation({ summary: '预览项目节点分工配置影响，不写入' })
  @Post('projects/:projectId/assignments/:nodeCode/preview')
  previewNodeAssignment(
    @Param('projectId') projectId: string,
    @Param('nodeCode', new ParseEnumPipe(WorkflowNodeCode))
    nodeCode: WorkflowNodeCode,
    @Body() body: AdminNodeAssignmentPreviewDto,
  ) {
    return this.service.previewNodeAssignment(projectId, nodeCode, body);
  }

  @ApiOperation({ summary: '保存项目节点分工配置并写入审计' })
  @Post('projects/:projectId/assignments/:nodeCode')
  changeNodeAssignment(
    @Param('projectId') projectId: string,
    @Param('nodeCode', new ParseEnumPipe(WorkflowNodeCode))
    nodeCode: WorkflowNodeCode,
    @Body() body: AdminNodeAssignmentChangeDto,
    @Headers('idempotency-key') headerKey: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    this.assertIdempotencyKey(body.idempotencyKey, headerKey);
    return this.service.changeNodeAssignment(
      projectId,
      nodeCode,
      body,
      actor,
      requestId?.trim() || body.idempotencyKey,
    );
  }

  @ApiOperation({ summary: '真实 RBAC 权限矩阵' })
  @Get('permissions')
  getPermissions() {
    return this.service.getPermissions();
  }

  @ApiOperation({ summary: '流程模板和节点版本台账' })
  @Get('workflow-templates')
  getWorkflowTemplates() {
    return this.service.getWorkflowTemplates();
  }

  @ApiOperation({ summary: '基础字典和锁定参数' })
  @Get('dictionaries')
  getDictionaries() {
    return this.service.getDictionaries();
  }

  @ApiOperation({ summary: '读取当前管理员保存的表格视图' })
  @Get('saved-views')
  getSavedViews(
    @Query() query: AdminSavedViewQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.getSavedViews(query.pageKey, actor);
  }

  @ApiOperation({ summary: '保存当前管理员的筛选和列布局' })
  @Post('saved-views')
  saveView(
    @Body() body: AdminSavedViewDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.saveView(body, actor);
  }

  @ApiOperation({ summary: '修改项目允许直接编辑的展示字段' })
  @Patch('projects/:projectId/basic-info')
  updateProjectBasicInfo(
    @Param('projectId') projectId: string,
    @Body() body: AdminProjectBasicInfoDto,
    @Headers('idempotency-key') headerKey: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    this.assertIdempotencyKey(body.idempotencyKey, headerKey);
    return this.service.updateProjectBasicInfo(
      projectId,
      body,
      actor,
      requestId?.trim() || body.idempotencyKey,
    );
  }

  @ApiOperation({ summary: '工序计划日期调整影响预览，不写入' })
  @Post('tasks/:taskId/schedule-change-preview')
  previewScheduleChange(
    @Param('taskId') taskId: string,
    @Body() body: AdminSchedulePreviewDto,
  ) {
    return this.service.previewScheduleChange(taskId, body);
  }

  @ApiOperation({ summary: '确认工序计划日期调整' })
  @Post('tasks/:taskId/schedule-change')
  changeSchedule(
    @Param('taskId') taskId: string,
    @Body() body: AdminScheduleChangeDto,
    @Headers('idempotency-key') headerKey: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    this.assertIdempotencyKey(body.idempotencyKey, headerKey);
    return this.service.changeSchedule(
      taskId,
      body,
      actor,
      requestId?.trim() || body.idempotencyKey,
    );
  }

  @ApiOperation({ summary: '负责人和部门调整影响预览，不写入' })
  @Post('tasks/:taskId/assignment-change-preview')
  previewAssignmentChange(
    @Param('taskId') taskId: string,
    @Body() body: AdminAssignmentPreviewDto,
  ) {
    return this.service.previewAssignmentChange(taskId, body);
  }

  @ApiOperation({ summary: '批量工序计划或分工调整影响预览，不写入' })
  @Post('tasks/batch-change-preview')
  previewBatchTaskChanges(@Body() body: AdminBatchTaskPreviewDto) {
    return this.service.previewBatchTaskChanges(body);
  }

  @ApiOperation({ summary: '原子执行批量工序计划或分工调整' })
  @Post('tasks/batch-change')
  applyBatchTaskChanges(
    @Body() body: AdminBatchTaskChangeDto,
    @Headers('idempotency-key') headerKey: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    this.assertIdempotencyKey(body.idempotencyKey, headerKey);
    return this.service.applyBatchTaskChanges(
      body,
      actor,
      requestId?.trim() || body.idempotencyKey,
    );
  }

  @ApiOperation({ summary: '确认负责人和部门调整' })
  @Post('tasks/:taskId/assignment-change')
  changeAssignment(
    @Param('taskId') taskId: string,
    @Body() body: AdminAssignmentChangeDto,
    @Headers('idempotency-key') headerKey: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    this.assertIdempotencyKey(body.idempotencyKey, headerKey);
    return this.service.changeAssignment(
      taskId,
      body,
      actor,
      requestId?.trim() || body.idempotencyKey,
    );
  }

  @ApiOperation({ summary: '启用、停用或锁定系统用户' })
  @Post('users/:userId/status-change')
  changeUserStatus(
    @Param('userId') userId: string,
    @Body() body: AdminUserStatusChangeDto,
    @Headers('idempotency-key') headerKey: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    this.assertIdempotencyKey(body.idempotencyKey, headerKey);
    return this.service.changeUserStatus(
      userId,
      body,
      actor,
      requestId?.trim() || body.idempotencyKey,
    );
  }

  @ApiOperation({ summary: '修改非系统保留字典项' })
  @Post('dictionaries/:itemId/change')
  changeDictionaryItem(
    @Param('itemId') itemId: string,
    @Body() body: AdminDictionaryChangeDto,
    @Headers('idempotency-key') headerKey: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    this.assertIdempotencyKey(body.idempotencyKey, headerKey);
    return this.service.changeDictionaryItem(
      itemId,
      body,
      actor,
      requestId?.trim() || body.idempotencyKey,
    );
  }

  @ApiOperation({ summary: '创建只影响未来项目的流程模板版本' })
  @Post('workflow-templates/:templateId/versions')
  createTemplateVersion(
    @Param('templateId') templateId: string,
    @Body() body: AdminTemplateVersionDto,
    @Headers('idempotency-key') headerKey: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    this.assertIdempotencyKey(body.idempotencyKey, headerKey);
    return this.service.createTemplateVersion(
      templateId,
      body,
      actor,
      requestId?.trim() || body.idempotencyKey,
    );
  }

  private assertIdempotencyKey(
    bodyKey: string,
    headerKey: string | undefined,
  ) {
    if (!headerKey?.trim()) {
      throw new BadRequestException('缺少 Idempotency-Key 请求头。');
    }
    if (headerKey.trim() !== bodyKey) {
      throw new BadRequestException('Idempotency-Key 请求头与请求体不一致。');
    }
  }
}
