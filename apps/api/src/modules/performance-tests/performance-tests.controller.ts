import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PerformanceTestsService } from './performance-tests.service';

type UploadedBinaryFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller('projects/:projectId/performance-tests')
export class PerformanceTestsController {
  constructor(
    private readonly performanceTestsService: PerformanceTestsService,
  ) {}

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Get()
  getWorkspace(@Param('projectId') projectId: string) {
    return this.performanceTestsService.getWorkspace(projectId);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Get(':testId')
  getDetail(
    @Param('projectId') projectId: string,
    @Param('testId') testId: string,
  ) {
    return this.performanceTestsService.getDetail(projectId, testId);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Post()
  createTest(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.performanceTestsService.createTest(projectId, body, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Patch(':testId')
  updateTest(
    @Param('projectId') projectId: string,
    @Param('testId') testId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.performanceTestsService.updateTest(projectId, testId, body, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @UseInterceptors(FileInterceptor('file'))
  @Post(':testId/report')
  uploadReport(
    @Param('projectId') projectId: string,
    @Param('testId') testId: string,
    @UploadedFile() file: UploadedBinaryFile | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.performanceTestsService.uploadReport(projectId, testId, file, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Post(':testId/submit')
  submitTest(
    @Param('projectId') projectId: string,
    @Param('testId') testId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.performanceTestsService.submitTest(projectId, testId, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Post('complete-task')
  completeTask(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.performanceTestsService.completeTask(projectId, actor);
  }
}
