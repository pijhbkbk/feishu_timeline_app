import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PersonsService } from './persons.service';

@Controller('persons')
export class PersonsController {
  constructor(private readonly persons: PersonsService) {}
  @Get() list(@Query() query: Record<string, unknown>, @CurrentUser() actor: AuthenticatedUser) { return this.persons.list(query, actor); }
  @Post() create(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) { return this.persons.create(body, actor); }
  @Patch('sheet') sheet(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) { return this.persons.saveSheet(body, actor); }
  @Get(':id') detail(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.persons.detail(id, actor); }
  @Patch(':id/department') department(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) { return this.persons.changeDepartment(id, body, actor); }
  @Post(':id/account-link') link(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) { return this.persons.linkAccount(id, body, actor); }
}
