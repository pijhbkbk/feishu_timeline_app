import { Module } from '@nestjs/common';
import { TeamTasksController } from './team-tasks.controller';
import { TeamTasksService } from './team-tasks.service';
import { PersonnelController } from './personnel.controller';
import { PersonnelService } from './personnel.service';

@Module({ controllers: [PersonnelController, TeamTasksController], providers: [PersonnelService, TeamTasksService], exports: [PersonnelService] })
export class PersonnelModule {}
