import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import { SaveRetrospectiveDto } from './dto/save-retrospective.dto';
import { RetrospectivesService } from './retrospectives.service';

@ApiTags('retrospectives')
@ApiCookieAuth('ft_session')
@Controller('projects/:projectId/retrospective')
export class RetrospectivesController {
  constructor(private readonly retrospectivesService: RetrospectivesService) {}

  @Permissions('project.read')
  @ApiOperation({ summary: '获取项目全生命周期复盘' })
  @Get()
  getRetrospective(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.retrospectivesService.getRetrospective(projectId, actor);
  }

  @Roles('admin', 'project_manager')
  @Permissions('project.write')
  @ApiOperation({ summary: '保存项目复盘草稿' })
  @Put()
  saveRetrospective(
    @Param('projectId') projectId: string,
    @Body() body: SaveRetrospectiveDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.retrospectivesService.saveRetrospective(projectId, body, actor);
  }

  @Roles('admin', 'project_manager')
  @Permissions('project.write')
  @ApiOperation({ summary: '完成项目复盘' })
  @Post('complete')
  completeRetrospective(
    @Param('projectId') projectId: string,
    @Body() body: SaveRetrospectiveDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.retrospectivesService.completeRetrospective(projectId, body, actor);
  }
}
