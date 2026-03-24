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
import { MassProductionsService } from './mass-productions.service';

@Controller('projects/:projectId/mass-production')
export class MassProductionsController {
  constructor(
    private readonly massProductionsService: MassProductionsService,
  ) {}

  @Get()
  getWorkspace(@Param('projectId') projectId: string) {
    return this.massProductionsService.getWorkspace(projectId);
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Post()
  createRecord(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.massProductionsService.createRecord(projectId, body, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Patch(':recordId')
  updateRecord(
    @Param('projectId') projectId: string,
    @Param('recordId') recordId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.massProductionsService.updateRecord(projectId, recordId, body, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Post(':recordId/start')
  startRecord(
    @Param('projectId') projectId: string,
    @Param('recordId') recordId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.massProductionsService.startRecord(projectId, recordId, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Post(':recordId/complete')
  completeRecord(
    @Param('projectId') projectId: string,
    @Param('recordId') recordId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.massProductionsService.completeRecord(projectId, recordId, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Post(':recordId/cancel')
  cancelRecord(
    @Param('projectId') projectId: string,
    @Param('recordId') recordId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.massProductionsService.cancelRecord(projectId, recordId, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Post('complete-task')
  completeTask(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.massProductionsService.completeTask(projectId, actor);
  }
}
