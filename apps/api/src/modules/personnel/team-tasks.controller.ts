import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { TeamTaskCommandDto, TeamTaskQueryDto } from './team-task.dto';
import { TeamTasksService } from './team-tasks.service';

@Controller('team-tasks')
export class TeamTasksController {
  constructor(private readonly tasks: TeamTasksService) {}
  @Get('overview') overview(@CurrentUser() actor: AuthenticatedUser) { return this.tasks.overview(actor); }
  @Get() list(@CurrentUser() actor: AuthenticatedUser, @Query() query: TeamTaskQueryDto) { return this.tasks.list(actor, query); }
  @Get('monthly') listMonthly(@CurrentUser() actor: AuthenticatedUser, @Query() query: TeamTaskQueryDto) { return this.tasks.listMonthly(actor, query); }
  @Post('monthly/:id/claim') claimMonthly(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() input: TeamTaskCommandDto) { return this.tasks.claimMonthly(actor, id, input); }
  @Post('monthly/:id/transfer') transferMonthly(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() input: TeamTaskCommandDto) { return this.tasks.claimMonthly(actor, id, input, true); }
  @Post(':id/claim') claim(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() input: TeamTaskCommandDto) { return this.tasks.claim(actor, id, input); }
  @Post(':id/transfer') transfer(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() input: TeamTaskCommandDto) { return this.tasks.claim(actor, id, input, true); }
}
