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
import { PaintProcurementsService } from './paint-procurements.service';

@Controller('projects/:projectId/paint-procurements')
export class PaintProcurementsController {
  constructor(
    private readonly paintProcurementsService: PaintProcurementsService,
  ) {}

  @Roles('admin', 'project_manager', 'purchaser')
  @Permissions('project.read')
  @Get()
  getWorkspace(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.paintProcurementsService.getWorkspace(projectId, actor);
  }

  @Roles('admin', 'project_manager', 'purchaser')
  @Permissions('workflow.transition')
  @Post()
  createProcurement(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.paintProcurementsService.createProcurement(projectId, body, actor);
  }

  @Roles('admin', 'project_manager', 'purchaser')
  @Permissions('workflow.transition')
  @Patch(':procurementId')
  updateProcurement(
    @Param('projectId') projectId: string,
    @Param('procurementId') procurementId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.paintProcurementsService.updateProcurement(
      projectId,
      procurementId,
      body,
      actor,
    );
  }

  @Roles('admin', 'project_manager', 'purchaser')
  @Permissions('workflow.transition')
  @Post(':procurementId/order')
  orderProcurement(
    @Param('projectId') projectId: string,
    @Param('procurementId') procurementId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.paintProcurementsService.orderProcurement(projectId, procurementId, actor);
  }

  @Roles('admin', 'project_manager', 'purchaser')
  @Permissions('workflow.transition')
  @Post(':procurementId/mark-arrived')
  markArrived(
    @Param('projectId') projectId: string,
    @Param('procurementId') procurementId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.paintProcurementsService.markArrived(projectId, procurementId, actor);
  }

  @Roles('admin', 'project_manager', 'purchaser')
  @Permissions('workflow.transition')
  @Post(':procurementId/cancel')
  cancelProcurement(
    @Param('projectId') projectId: string,
    @Param('procurementId') procurementId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.paintProcurementsService.cancelProcurement(projectId, procurementId, actor);
  }

  @Roles('admin', 'project_manager', 'purchaser')
  @Permissions('workflow.transition')
  @Post('complete-task')
  completeTask(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.paintProcurementsService.completeTask(projectId, actor);
  }
}
