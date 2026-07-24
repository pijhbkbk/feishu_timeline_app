import { Module } from '@nestjs/common';

import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { ProjectsModule } from '../projects/projects.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { R26ReadModelController } from './r26-read-model.controller';
import { R26MemberAssignmentService } from './r26-member-assignment.service';
import { R26ReadModelService } from './r26-read-model.service';

@Module({
  imports: [
    ActivityLogsModule,
    DashboardModule,
    ProjectsModule,
    WorkflowsModule,
  ],
  controllers: [R26ReadModelController],
  providers: [R26ReadModelService, R26MemberAssignmentService],
})
export class R26ReadModelModule {}
