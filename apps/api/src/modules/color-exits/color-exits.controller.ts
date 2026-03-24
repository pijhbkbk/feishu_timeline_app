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
import { ColorExitsService } from './color-exits.service';

@Controller('projects/:projectId/color-exit')
export class ColorExitsController {
  constructor(private readonly colorExitsService: ColorExitsService) {}

  @Get()
  getWorkspace(@Param('projectId') projectId: string) {
    return this.colorExitsService.getWorkspace(projectId);
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Post()
  createExitRecord(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.colorExitsService.createExitRecord(projectId, body, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Patch(':exitId')
  updateExitRecord(
    @Param('projectId') projectId: string,
    @Param('exitId') exitId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.colorExitsService.updateExitRecord(projectId, exitId, body, actor);
  }

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
