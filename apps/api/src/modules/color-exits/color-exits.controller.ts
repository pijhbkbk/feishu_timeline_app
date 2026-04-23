import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ColorExitWriteDto } from './dto/color-exit-write.dto';
import { ColorExitsService } from './color-exits.service';

@ApiTags('color-exits')
@ApiCookieAuth('ft_session')
@Controller('projects/:projectId/color-exit')
export class ColorExitsController {
  constructor(private readonly colorExitsService: ColorExitsService) {}

  @Permissions('project.read')
  @ApiOperation({ summary: '获取第 18 步颜色退出工作区' })
  @Get()
  getWorkspace(@Param('projectId') projectId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.colorExitsService.getWorkspace(projectId, actor);
  }

  @Permissions('workflow.transition')
  @ApiOperation({ summary: '创建颜色退出记录' })
  @Roles('admin', 'project_manager', 'process_engineer')
  @Post()
  createExitRecord(
    @Param('projectId') projectId: string,
    @Body() body: ColorExitWriteDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.colorExitsService.createExitRecord(projectId, body, actor);
  }

  @Permissions('workflow.transition')
  @ApiOperation({ summary: '更新颜色退出记录' })
  @Roles('admin', 'project_manager', 'process_engineer')
  @Patch(':exitId')
  updateExitRecord(
    @Param('projectId') projectId: string,
    @Param('exitId') exitId: string,
    @Body() body: ColorExitWriteDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.colorExitsService.updateExitRecord(projectId, exitId, body, actor);
  }

  @Permissions('workflow.transition')
  @ApiOperation({ summary: '完成颜色退出记录' })
  @Roles('admin', 'project_manager', 'process_engineer')
  @Post(':exitId/complete')
  completeExitRecord(
    @Param('projectId') projectId: string,
    @Param('exitId') exitId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.colorExitsService.completeExitRecord(projectId, exitId, actor);
  }
}
