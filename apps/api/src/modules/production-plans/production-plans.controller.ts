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
import { ProductionPlansService } from './production-plans.service';

@Controller('projects/:projectId/production-plans/schedule')
export class ProductionPlansController {
  constructor(private readonly productionPlansService: ProductionPlansService) {}

  @Get()
  getScheduleWorkspace(@Param('projectId') projectId: string) {
    return this.productionPlansService.getScheduleWorkspace(projectId);
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Post()
  createSchedulePlan(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productionPlansService.createSchedulePlan(projectId, body, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Patch(':planId')
  updateSchedulePlan(
    @Param('projectId') projectId: string,
    @Param('planId') planId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productionPlansService.updateSchedulePlan(projectId, planId, body, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Post(':planId/confirm')
  confirmSchedulePlan(
    @Param('projectId') projectId: string,
    @Param('planId') planId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productionPlansService.confirmSchedulePlan(projectId, planId, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Post(':planId/cancel')
  cancelSchedulePlan(
    @Param('projectId') projectId: string,
    @Param('planId') planId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productionPlansService.cancelSchedulePlan(projectId, planId, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Post('complete-task')
  completeScheduleTask(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productionPlansService.completeScheduleTask(projectId, actor);
  }
}
