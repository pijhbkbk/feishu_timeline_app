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
import { PilotProductionsService } from './pilot-productions.service';

@Controller()
export class PilotProductionsController {
  constructor(private readonly pilotProductionsService: PilotProductionsService) {}

  @Roles('production_operator', 'admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Permissions('project.read')
  @Get('projects/:projectId/first-production-plans')
  getFirstProductionPlanWorkspace(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pilotProductionsService.getFirstProductionPlanWorkspace(projectId, actor);
  }

  @Roles('production_operator', 'admin', 'project_manager', 'process_engineer')
  @Permissions('workflow.transition')
  @Post('projects/:projectId/first-production-plans')
  createFirstProductionPlan(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pilotProductionsService.createFirstProductionPlan(projectId, body, actor);
  }

  @Roles('production_operator', 'admin', 'project_manager', 'process_engineer')
  @Permissions('workflow.transition')
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

  @Roles('production_operator', 'admin', 'project_manager', 'process_engineer')
  @Permissions('workflow.transition')
  @Post('projects/:projectId/first-production-plans/:planId/confirm')
  confirmFirstProductionPlan(
    @Param('projectId') projectId: string,
    @Param('planId') planId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pilotProductionsService.confirmFirstProductionPlan(projectId, planId, actor);
  }

  @Roles('production_operator', 'admin', 'project_manager', 'process_engineer')
  @Permissions('workflow.transition')
  @Post('projects/:projectId/first-production-plans/complete-task')
  completeFirstProductionPlanTask(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pilotProductionsService.completeFirstProductionPlanTask(projectId, actor);
  }

  @Roles('production_operator', 'admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Permissions('project.read')
  @Get('projects/:projectId/trial-productions')
  getTrialProductionWorkspace(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pilotProductionsService.getTrialProductionWorkspace(projectId, actor);
  }

  @Roles('production_operator', 'admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Permissions('project.read')
  @Get('projects/:projectId/trial-productions/:trialId')
  getTrialProductionDetail(
    @Param('projectId') projectId: string,
    @Param('trialId') trialId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pilotProductionsService.getTrialProductionDetail(projectId, trialId, actor);
  }

  @Roles('production_operator', 'admin', 'project_manager', 'process_engineer')
  @Permissions('workflow.transition')
  @Post('projects/:projectId/trial-productions')
  createTrialProduction(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pilotProductionsService.createTrialProduction(projectId, body, actor);
  }

  @Roles('production_operator', 'admin', 'project_manager', 'process_engineer')
  @Permissions('workflow.transition')
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

  @Roles('production_operator', 'admin', 'project_manager', 'process_engineer')
  @Permissions('workflow.transition')
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

  @Roles('production_operator', 'admin', 'project_manager', 'process_engineer')
  @Permissions('workflow.transition')
  @Post('projects/:projectId/trial-productions/:trialId/complete')
  completeTrialProductionRecord(
    @Param('projectId') projectId: string,
    @Param('trialId') trialId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pilotProductionsService.completeTrialProductionRecord(projectId, trialId, actor);
  }

  @Roles('production_operator', 'admin', 'project_manager', 'process_engineer')
  @Permissions('workflow.transition')
  @Post('projects/:projectId/trial-productions/complete-task')
  completeTrialProductionTask(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pilotProductionsService.completeTrialProductionTask(projectId, actor);
  }
}
