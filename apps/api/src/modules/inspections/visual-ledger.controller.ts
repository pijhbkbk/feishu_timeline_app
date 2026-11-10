import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { VisualLedgerService } from './visual-ledger.service';
@Controller('inspections/visual-records')
export class VisualLedgerController {
  constructor(private readonly service: VisualLedgerService) {}
  @Get() @Permissions('project.read')
  list(@Query() query: Record<string, unknown>, @CurrentUser() actor: AuthenticatedUser) { return this.service.list(query, actor); }
  @Get(':id/history') @Permissions('project.read')
  history(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.service.history(id, actor); }
  @Get(':id') @Permissions('project.read')
  detail(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.service.detail(id, actor); }
  @Patch('batch') @Permissions('project.write')
  batch(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) { return this.service.save(body, actor); }
}
