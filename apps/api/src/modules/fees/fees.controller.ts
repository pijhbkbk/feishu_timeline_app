import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { FeesService } from './fees.service';

@Controller('projects/:projectId/fees')
export class FeesController {
  constructor(private readonly feesService: FeesService) {}

  @Get()
  getWorkspace(@Param('projectId') projectId: string) {
    return this.feesService.getWorkspace(projectId);
  }

  @Roles('admin', 'project_manager', 'finance')
  @Post()
  createFee(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.feesService.createFee(projectId, body, actor);
  }

  @Roles('admin', 'project_manager', 'finance')
  @Patch(':feeId')
  updateFee(
    @Param('projectId') projectId: string,
    @Param('feeId') feeId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.feesService.updateFee(projectId, feeId, body, actor);
  }

  @Roles('admin', 'project_manager', 'finance')
  @Post(':feeId/mark-recorded')
  markRecorded(
    @Param('projectId') projectId: string,
    @Param('feeId') feeId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.feesService.markRecorded(projectId, feeId, actor);
  }

  @Roles('admin', 'project_manager', 'finance')
  @Post(':feeId/mark-paid')
  markPaid(
    @Param('projectId') projectId: string,
    @Param('feeId') feeId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.feesService.markPaid(projectId, feeId, actor);
  }

  @Roles('admin', 'project_manager', 'finance')
  @Post(':feeId/cancel')
  cancelFee(
    @Param('projectId') projectId: string,
    @Param('feeId') feeId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.feesService.cancelFee(projectId, feeId, actor);
  }

  @Roles('admin', 'project_manager', 'finance')
  @Post('complete-task')
  completeTask(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.feesService.completeTask(projectId, actor);
  }
}
