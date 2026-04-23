import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

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
  constructor(private readonly projectsService: ProjectsService) {}

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
    description: '当前接口不做请求级幂等；调用方需保证项目编号不会被重复提交。',
  })
  @Roles('admin', 'project_manager')
  @Post()
  createProject(@Body() body: CreateProjectDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.projectsService.createProject(body, actor);
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
    summary: '替换项目成员',
    description: '该接口会整体替换当前成员列表，而不是增量追加。',
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
