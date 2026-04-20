import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AttachmentsService } from './attachments.service';

type UploadedBinaryFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller()
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Permissions('project.read')
  @Get('attachments/:attachmentId/content')
  async getAttachmentContent(
    @Param('attachmentId') attachmentId: string,
    @Query('disposition') disposition: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const content = await this.attachmentsService.getAttachmentContent(
      attachmentId,
      actor,
      disposition,
    );

    response.setHeader('Content-Type', content.contentType);
    response.setHeader(
      'Content-Disposition',
      `${content.disposition}; filename*=UTF-8''${encodeURIComponent(content.fileName)}`,
    );
    response.send(content.buffer);
  }

  @Permissions('project.read')
  @Get('projects/:projectId/attachments')
  getWorkspace(
    @Param('projectId') projectId: string,
    @Query() query: Record<string, unknown>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attachmentsService.getWorkspace(projectId, query, actor);
  }

  @Permissions('project.read')
  @Get('projects/:projectId/attachments/by-entity')
  getAttachmentsByEntity(
    @Param('projectId') projectId: string,
    @Query() query: Record<string, unknown>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attachmentsService.getAttachmentsByEntity(projectId, query, actor);
  }

  @Permissions('project.read')
  @Get('projects/:projectId/attachments/:attachmentId')
  getAttachmentDetail(
    @Param('projectId') projectId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attachmentsService.getAttachmentDetail(projectId, attachmentId, actor);
  }

  @Roles(
    'admin',
    'project_manager',
    'process_engineer',
    'quality_engineer',
    'purchaser',
    'reviewer',
    'finance',
  )
  @Permissions('attachment.manage')
  @UseInterceptors(FileInterceptor('file'))
  @Post('projects/:projectId/attachments/upload')
  uploadAttachment(
    @Param('projectId') projectId: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile() file: UploadedBinaryFile | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attachmentsService.uploadAttachment(projectId, body, file, actor);
  }

  @Roles(
    'admin',
    'project_manager',
    'process_engineer',
    'quality_engineer',
    'purchaser',
    'reviewer',
    'finance',
  )
  @Permissions('attachment.manage')
  @Post('projects/:projectId/attachments/:attachmentId/bind')
  bindAttachment(
    @Param('projectId') projectId: string,
    @Param('attachmentId') attachmentId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attachmentsService.bindAttachment(projectId, attachmentId, body, actor);
  }

  @Roles(
    'admin',
    'project_manager',
    'process_engineer',
    'quality_engineer',
    'purchaser',
    'reviewer',
    'finance',
  )
  @Permissions('attachment.manage')
  @Post('projects/:projectId/attachments/:attachmentId/unbind')
  unbindAttachment(
    @Param('projectId') projectId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attachmentsService.unbindAttachment(projectId, attachmentId, actor);
  }

  @Roles(
    'admin',
    'project_manager',
    'process_engineer',
    'quality_engineer',
    'purchaser',
    'reviewer',
    'finance',
  )
  @Permissions('attachment.manage')
  @Delete('projects/:projectId/attachments/:attachmentId')
  deleteAttachment(
    @Param('projectId') projectId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attachmentsService.deleteAttachment(projectId, attachmentId, actor);
  }

  @Permissions('project.read')
  @Get('projects/:projectId/attachments/:attachmentId/download')
  async downloadAttachment(
    @Param('projectId') projectId: string,
    @Param('attachmentId') attachmentId: string,
    @Query('disposition') disposition: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const content = await this.attachmentsService.downloadAttachment(
      projectId,
      attachmentId,
      actor,
      disposition,
    );

    response.setHeader('Content-Type', content.contentType);
    response.setHeader(
      'Content-Disposition',
      `${content.disposition}; filename*=UTF-8''${encodeURIComponent(content.fileName)}`,
    );
    response.send(content.buffer);
  }
}
