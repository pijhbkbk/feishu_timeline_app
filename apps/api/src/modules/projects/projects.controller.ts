import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  listProjects(@Query() query: Record<string, string | undefined>) {
    return this.projectsService.listProjects(query);
  }

  @Get(':projectId')
  getProjectDetail(@Param('projectId') projectId: string) {
    return this.projectsService.getProjectDetail(projectId);
  }

  @Roles('admin', 'project_manager')
  @Post()
  createProject(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.projectsService.createProject(body, actor);
  }

  @Roles('admin', 'project_manager')
  @Patch(':projectId')
  updateProject(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.projectsService.updateProject(projectId, body, actor);
  }

  @Roles('admin', 'project_manager')
  @Put(':projectId/members')
  replaceProjectMembers(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.projectsService.replaceProjectMembers(projectId, body, actor);
  }
}
