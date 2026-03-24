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
import { PilotProductionsService } from './pilot-productions.service';

@Controller()
export class PilotProductionsController {
  constructor(private readonly pilotProductionsService: PilotProductionsService) {}

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Get('projects/:projectId/first-production-plans')
  getFirstProductionPlanWorkspace(@Param('projectId') projectId: string) {
    return this.pilotProductionsService.getFirstProductionPlanWorkspace(projectId);
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Post('projects/:projectId/first-production-plans')
  createFirstProductionPlan(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pilotProductionsService.createFirstProductionPlan(projectId, body, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Patch('projects/:projectId/first-production-plans/:planId')
  updateFirstProductionPlan(
    @Param('projectId') projectId: string,
    @Param('planId') planId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pilotProductionsService.updateFirstProductionPlan(
      projectId,
      planId,
      body,
      actor,
    );
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Post('projects/:projectId/first-production-plans/:planId/confirm')
  confirmFirstProductionPlan(
    @Param('projectId') projectId: string,
    @Param('planId') planId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pilotProductionsService.confirmFirstProductionPlan(projectId, planId, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Post('projects/:projectId/first-production-plans/complete-task')
  completeFirstProductionPlanTask(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pilotProductionsService.completeFirstProductionPlanTask(projectId, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Get('projects/:projectId/trial-productions')
  getTrialProductionWorkspace(@Param('projectId') projectId: string) {
    return this.pilotProductionsService.getTrialProductionWorkspace(projectId);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Get('projects/:projectId/trial-productions/:trialId')
  getTrialProductionDetail(
    @Param('projectId') projectId: string,
    @Param('trialId') trialId: string,
  ) {
    return this.pilotProductionsService.getTrialProductionDetail(projectId, trialId);
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Post('projects/:projectId/trial-productions')
  createTrialProduction(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pilotProductionsService.createTrialProduction(projectId, body, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Patch('projects/:projectId/trial-productions/:trialId')
  updateTrialProduction(
    @Param('projectId') projectId: string,
    @Param('trialId') trialId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pilotProductionsService.updateTrialProduction(
      projectId,
      trialId,
      body,
      actor,
    );
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Post('projects/:projectId/trial-productions/:trialId/add-issue')
  addTrialProductionIssue(
    @Param('projectId') projectId: string,
    @Param('trialId') trialId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pilotProductionsService.addTrialProductionIssue(
      projectId,
      trialId,
      body,
      actor,
    );
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Post('projects/:projectId/trial-productions/:trialId/complete')
  completeTrialProductionRecord(
    @Param('projectId') projectId: string,
    @Param('trialId') trialId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pilotProductionsService.completeTrialProductionRecord(projectId, trialId, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Post('projects/:projectId/trial-productions/complete-task')
  completeTrialProductionTask(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pilotProductionsService.completeTrialProductionTask(projectId, actor);
  }
}
