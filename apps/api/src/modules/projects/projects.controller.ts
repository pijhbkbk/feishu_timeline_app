import { ApprovedReportDto, ApprovedReportService } from './approved-report.service';
import { Body, Controller, Get, Headers, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectListQueryDto } from './dto/project-list-query.dto';
import { ReplaceProjectMembersDto } from './dto/replace-project-members.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiCookieAuth('ft_session')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService, private readonly approvedReports?: ApprovedReportService) {}

  @Permissions('project.write')
  @Post(':projectId/approved-report')
  registerApprovedReport(@Param('projectId') projectId: string, @Body() body: ApprovedReportDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.approvedReports!.register(projectId, body, actor);
  }

  @Permissions('project.read')
  @ApiOperation({ summary: '获取项目列表' })
  @Get()
  listProjects(@Query() query: ProjectListQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.projectsService.listProjects(query as Record<string, unknown>, actor);
  }

  @Permissions('project.read')
  @ApiOperation({ summary: '获取项目阶段概览' })
  @Get(':projectId/stage-overview')
  getProjectStageOverview(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.projectsService.getProjectStageOverview(projectId, actor);
  }

  @Permissions('project.read')
  @ApiOperation({ summary: '获取项目完整节点时间线' })
  @Get(':projectId/timeline')
  getProjectTimeline(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.projectsService.getProjectTimeline(projectId, actor);
  }

  @Permissions('project.read')
  @ApiOperation({ summary: '获取项目实时流程地图' })
  @Get(':projectId/flow-map')
  getProjectFlowMap(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.projectsService.getProjectFlowMap(projectId, actor);
  }

  @Permissions('project.read')
  @ApiOperation({ summary: '获取项目详情' })
  @Get(':projectId')
  getProjectDetail(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.projectsService.getProjectDetail(projectId, actor);
  }

  @Permissions('project.write')
  @ApiOperation({
    summary: '创建项目',
    description: '项目编号未传入时由服务端生成；项目创建后由服务端初始化流程实例。',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: '每次显式创建尝试使用一个新的 1-128 位安全幂等键；网络重试复用原键。',
  })
  @Roles('admin', 'project_manager')
  @Post()
  createProject(
    @Body() body: CreateProjectDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.projectsService.createProject(body, actor, idempotencyKey);
  }

  @Permissions('project.write')
  @ApiOperation({
    summary: '更新项目',
    description: '按项目 ID 覆盖更新指定字段，未传字段保持原值。',
  })
  @Roles('admin', 'project_manager')
  @Patch(':projectId')
  updateProject(
    @Param('projectId') projectId: string,
    @Body() body: UpdateProjectDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.projectsService.updateProject(projectId, body, actor);
  }

  @Permissions('project.write')
  @ApiOperation({
    summary: '已停用：替换项目成员',
    description: '成员变更必须使用 /api/v2/projects/:projectId/members 的版本化命令接口。',
    deprecated: true,
  })
  @Roles('admin', 'project_manager')
  @Put(':projectId/members')
  replaceProjectMembers(
    @Param('projectId') projectId: string,
    @Body() body: ReplaceProjectMembersDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.projectsService.replaceProjectMembers(projectId, body, actor);
  }
}
