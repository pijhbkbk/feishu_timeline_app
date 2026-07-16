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
import { FeesService } from './fees.service';

@Controller('projects/:projectId/fees')
export class FeesController {
  constructor(private readonly feesService: FeesService) {}

  @Permissions('project.read')
  @Get()
  getWorkspace(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.feesService.getWorkspace(projectId, actor);
  }

  @Permissions('workflow.transition')
  @Roles('admin', 'finance')
  @Post()
  createFee(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.feesService.createFee(projectId, body, actor);
  }

  @Permissions('workflow.transition')
  @Roles('admin', 'finance')
  @Patch(':feeId')
  updateFee(
    @Param('projectId') projectId: string,
    @Param('feeId') feeId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.feesService.updateFee(projectId, feeId, body, actor);
  }

  @Permissions('workflow.transition')
  @Roles('admin', 'finance')
  @Post(':feeId/mark-recorded')
  markRecorded(
    @Param('projectId') projectId: string,
    @Param('feeId') feeId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.feesService.markRecorded(projectId, feeId, actor);
  }

  @Permissions('workflow.transition')
  @Roles('admin', 'finance')
  @Post(':feeId/mark-paid')
  markPaid(
    @Param('projectId') projectId: string,
    @Param('feeId') feeId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.feesService.markPaid(projectId, feeId, actor);
  }

  @Permissions('workflow.transition')
  @Roles('admin', 'finance')
  @Post(':feeId/cancel')
  cancelFee(
    @Param('projectId') projectId: string,
    @Param('feeId') feeId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.feesService.cancelFee(projectId, feeId, actor);
  }

  @Permissions('workflow.transition')
  @Roles('admin', 'finance')
  @Post('complete-task')
  completeTask(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.feesService.completeTask(projectId, actor);
  }
}
