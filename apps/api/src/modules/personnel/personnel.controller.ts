import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PersonnelChangeDto, PersonnelQueryDto } from './personnel.dto';
import { PersonnelService } from './personnel.service';

@Controller('people')
export class PersonnelController {
  constructor(private readonly personnel: PersonnelService) {}
  @Get() list(@CurrentUser() actor: AuthenticatedUser, @Query() query: PersonnelQueryDto) { return this.personnel.list(actor, query); }
  @Patch(':id') change(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() input: PersonnelChangeDto) {
    return this.personnel.change(actor, id, input);
  }
}
