import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { R26ReadModelService } from './r26-read-model.service';

@ApiTags('r26-v2-read-model')
@ApiCookieAuth('ft_session')
@Controller('v2')
export class R26ReadModelController {
  constructor(private readonly service: R26ReadModelService) {}

  @Permissions('dashboard.read')
  @ApiOperation({ summary: 'R26 V2 当前用户工作台只读模型' })
  @Get('dashboard')
  getDashboard(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.getDashboard(actor);
  }

  @Permissions('project.read')
  @ApiOperation({ summary: 'R26 V2 项目列表只读模型' })
  @Get('projects')
  getProjects(
    @Query() query: Record<string, unknown>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.getProjects(query, actor);
  }

  @Permissions('project.read')
  @ApiOperation({ summary: 'R26 V2 项目工作区、成员分工和自动分配预览只读模型' })
  @Get('projects/:projectId/workspace')
  getWorkspace(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.getWorkspace(projectId, actor);
  }

  @Permissions('project.read')
  @ApiOperation({ summary: 'R26 V2 工序详情只读模型' })
  @Get('tasks/:taskId')
  getTask(
    @Param('taskId') taskId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.getTask(taskId, actor);
  }

  @Permissions('project.read')
  @ApiOperation({ summary: 'R26 V2 进展上下文只读模型（不提供写操作）' })
  @Get('tasks/:taskId/progress-context')
  getProgressContext(
    @Param('taskId') taskId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.getProgressContext(taskId, actor);
  }
}
