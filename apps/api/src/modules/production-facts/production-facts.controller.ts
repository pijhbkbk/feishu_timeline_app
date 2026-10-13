import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProductionFactsService } from './production-facts.service';
@Controller('production-facts')
export class ProductionFactsController {
  constructor(private readonly service: ProductionFactsService) {}
  @Get() @Permissions('project.read')
  list(@Query() query: Record<string, unknown>, @CurrentUser() actor: AuthenticatedUser) { return this.service.list(query, actor); }
  @Get('statistics') @Permissions('project.read')
  statistics(@Query() query: Record<string, unknown>, @CurrentUser() actor: AuthenticatedUser) { return this.service.statistics(query, actor); }
  @Get('sources') @Permissions('project.read')
  sources(@Query() query: Record<string, unknown>, @CurrentUser() actor: AuthenticatedUser) { return this.service.sources(query, actor); }
  @Get(':id') @Permissions('project.read')
  detail(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.service.detail(id, actor); }
  @Patch('batch') @Permissions('project.write')
  batch(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) { return this.service.saveBatch(body, actor); }
}
