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
import { SecureSingleFileInterceptor } from '../../common/file-upload-options';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
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
  @Permissions('project.read')
  @Get()
  getWorkspace(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.samplesService.getWorkspace(projectId, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer', 'reviewer')
  @Permissions('project.read')
  @Get(':sampleId')
  getDetail(
    @Param('projectId') projectId: string,
    @Param('sampleId') sampleId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.samplesService.getSampleDetail(projectId, sampleId, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Permissions('workflow.transition')
  @Post()
  createSample(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.samplesService.createSample(projectId, body, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer', 'quality_engineer')
  @Permissions('workflow.transition')
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
  @Permissions('attachment.manage')
  @UseInterceptors(SecureSingleFileInterceptor('file'))
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
  @Permissions('workflow.transition')
  @Post('confirm')
  submitConfirmation(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.samplesService.submitConfirmation(projectId, body, actor);
  }
}
