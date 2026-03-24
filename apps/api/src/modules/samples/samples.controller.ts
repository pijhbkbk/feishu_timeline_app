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
import { SamplesService } from './samples.service';

type UploadedBinaryFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller('projects/:projectId/samples')
export class SamplesController {
  constructor(private readonly samplesService: SamplesService) {}

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer', 'reviewer')
  @Get()
  getWorkspace(@Param('projectId') projectId: string) {
    return this.samplesService.getWorkspace(projectId);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer', 'reviewer')
  @Get(':sampleId')
  getDetail(
    @Param('projectId') projectId: string,
    @Param('sampleId') sampleId: string,
  ) {
    return this.samplesService.getSampleDetail(projectId, sampleId);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Post()
  createSample(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.samplesService.createSample(projectId, body, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Patch(':sampleId')
  updateSample(
    @Param('projectId') projectId: string,
    @Param('sampleId') sampleId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.samplesService.updateSample(projectId, sampleId, body, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @UseInterceptors(FileInterceptor('file'))
  @Post(':sampleId/images')
  uploadImage(
    @Param('projectId') projectId: string,
    @Param('sampleId') sampleId: string,
    @UploadedFile() file: UploadedBinaryFile | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.samplesService.uploadSampleImage(projectId, sampleId, file, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer', 'reviewer')
  @Post('confirm')
  submitConfirmation(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.samplesService.submitConfirmation(projectId, body, actor);
  }
}
