import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SecureSingleFileInterceptor } from '../../common/file-upload-options';
import { DownloadAdmissionInterceptor } from '../../common/download-admission.interceptor';
import { SheetImagesService } from './sheet-images.service';

@Controller('sheet-images')
export class SheetImagesController {
  constructor(private readonly images: SheetImagesService) {}
  @Get() list(@Query() query: Record<string, unknown>, @CurrentUser() actor: AuthenticatedUser) { return this.images.list(query, actor); }
  @Post() @UseInterceptors(SecureSingleFileInterceptor('file'))
  upload(@Body() body: unknown, @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined, @CurrentUser() actor: AuthenticatedUser) { return this.images.upload(body, file, actor); }
  @Patch(':id/layout') layout(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) { return this.images.mutate(id, body, actor); }
  @Delete(':id') remove(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) { return this.images.mutate(id, body, actor, true); }
  @Get(':id/thumbnail') @UseInterceptors(DownloadAdmissionInterceptor)
  async thumbnail(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser, @Res() response: Response) {
    const bytes = await this.images.thumbnail(id, actor);
    response.set({ 'Content-Type': 'image/webp', 'Content-Length': String(bytes.length), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    response.send(bytes);
  }
}
