import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ColorRegisterService } from './color-register.service';

@Controller('color-register')
export class ColorRegisterController {
  constructor(private readonly service: ColorRegisterService) {}
  @Get() @Permissions('project.read')
  list(@Query() query: Record<string, unknown>, @CurrentUser() actor: AuthenticatedUser) { return this.service.list(query, actor); }
  @Get('sources') @Permissions('project.read')
  sources(@Query() query: Record<string, unknown>, @CurrentUser() actor: AuthenticatedUser) { return this.service.sources(query, actor); }
  @Patch('sheet') @Permissions('project.write')
  sheet(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) { return this.service.saveSheet(body, actor); }
  @Patch('notes') @Permissions('project.write')
  notes(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) { return this.service.saveNotes(body, actor); }
  @Get(':id') @Permissions('project.read')
  detail(@Param('id') id: string, @Query() query: Record<string, unknown>, @CurrentUser() actor: AuthenticatedUser) { return this.service.detail(id, query, actor); }
  @Post(':id/standards') @Permissions('project.write')
  correct(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) { return this.service.correctStandard(id, body, actor); }
}
