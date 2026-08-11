import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';

import { DownloadAdmissionInterceptor } from '../../common/download-admission.interceptor';
import { SecureSingleFileInterceptor } from '../../common/file-upload-options';
import {
  closeDownloadStream,
  createSecureDownloadStreamableFile,
} from '../../common/secure-download-streamable-file';
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
  private readonly logger = new Logger(AttachmentsController.name);

  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Permissions('project.read')
  @UseInterceptors(DownloadAdmissionInterceptor)
  @Get('attachments/:attachmentId/content')
  async getAttachmentContent(
    @Param('attachmentId') attachmentId: string,
    @Query('disposition') disposition: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const content = await this.attachmentsService.getAttachmentContent(
      attachmentId,
      actor,
      disposition,
    );

    return this.buildDownloadResponse(response, content);
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
  @UseInterceptors(SecureSingleFileInterceptor('file'))
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
  @UseInterceptors(DownloadAdmissionInterceptor)
  @Get('projects/:projectId/attachments/:attachmentId/download')
  async downloadAttachment(
    @Param('projectId') projectId: string,
    @Param('attachmentId') attachmentId: string,
    @Query('disposition') disposition: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const content = await this.attachmentsService.downloadAttachment(
      projectId,
      attachmentId,
      actor,
      disposition,
    );

    return this.buildDownloadResponse(response, content);
  }

  private writeAttachmentResponseHeaders(
    response: Response,
    content: {
      contentType: string;
      disposition: string;
      fileName: string;
      contentLength: number;
    },
  ) {
    response.setHeader('Content-Type', content.contentType);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    response.setHeader('Content-Length', String(content.contentLength));
    response.setHeader('X-Accel-Buffering', 'no');
    response.setHeader(
      'Content-Disposition',
      `${content.disposition}; filename*=UTF-8''${this.encodeRfc5987FileName(content.fileName)}`,
    );
  }

  private encodeRfc5987FileName(fileName: string) {
    return encodeURIComponent(fileName).replace(
      /['()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  }

  private createDownloadFile(stream: NodeJS.ReadableStream) {
    return createSecureDownloadStreamableFile(
      stream as import('node:stream').Readable,
      () => this.logger.error('eventType=attachment_download_stream result=terminated'),
    );
  }

  private async buildDownloadResponse(
    response: Response,
    content: Awaited<ReturnType<AttachmentsService['downloadAttachment']>>,
  ) {
    try {
      this.writeAttachmentResponseHeaders(response, content);
      return this.createDownloadFile(content.stream);
    } catch {
      await closeDownloadStream(content.stream);
      this.logger.error(
        'eventType=attachment_download_response_setup result=failed',
      );
      throw new ServiceUnavailableException('附件内容暂不可用。');
    }
  }
}
