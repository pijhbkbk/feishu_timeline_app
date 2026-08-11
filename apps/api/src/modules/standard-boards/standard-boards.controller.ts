import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { StandardBoardsService } from './standard-boards.service';

@Controller()
export class StandardBoardsController {
  constructor(private readonly standardBoardsService: StandardBoardsService) {}

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Permissions('project.read')
  @Get('projects/:projectId/standard-boards')
  getWorkspace(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.standardBoardsService.getWorkspace(projectId, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Permissions('project.read')
  @Get('projects/:projectId/standard-boards/current')
  getCurrentBoard(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.standardBoardsService.getCurrentBoard(projectId, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Permissions('workflow.transition')
  @Post('projects/:projectId/standard-boards')
  createStandardBoard(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.standardBoardsService.createStandardBoard(projectId, body, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Permissions('workflow.transition')
  @Patch('projects/:projectId/standard-boards/:boardId')
  updateStandardBoard(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.standardBoardsService.updateStandardBoard(projectId, boardId, body, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Permissions('workflow.transition')
  @Post('projects/:projectId/standard-boards/:boardId/set-current')
  setCurrentBoard(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.standardBoardsService.setCurrentBoard(projectId, boardId, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Permissions('workflow.transition')
  @Post('projects/:projectId/standard-boards/:boardId/mark-created')
  markCreated(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.standardBoardsService.markCreated(projectId, boardId, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Permissions('workflow.transition')
  @Post('projects/:projectId/standard-boards/:boardId/issue')
  issueBoard(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.standardBoardsService.issueBoard(projectId, boardId, body, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Permissions('workflow.transition')
  @Post('projects/:projectId/standard-boards/:boardId/distributions')
  addDistribution(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.standardBoardsService.addDistribution(projectId, boardId, body, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Permissions('project.read')
  @Get('projects/:projectId/color-board-detail-update')
  getColorBoardDetailUpdateWorkspace(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.standardBoardsService.getColorBoardDetailUpdateWorkspace(projectId, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Permissions('workflow.transition')
  @Post('projects/:projectId/color-board-detail-update')
  createColorBoardDetailUpdate(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.standardBoardsService.createColorBoardDetailUpdate(projectId, body, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Permissions('workflow.transition')
  @Post('projects/:projectId/standard-boards/complete-task')
  completeStandardBoardTask(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.standardBoardsService.completeStandardBoardTask(projectId, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Permissions('workflow.transition')
  @Post('projects/:projectId/color-board-detail-update/complete-task')
  completeColorBoardDetailUpdateTask(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.standardBoardsService.completeColorBoardDetailUpdateTask(projectId, actor);
  }
}
