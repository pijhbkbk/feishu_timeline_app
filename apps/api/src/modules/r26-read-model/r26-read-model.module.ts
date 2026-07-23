import { Module } from '@nestjs/common';

import { DashboardModule } from '../dashboard/dashboard.module';
import { ProjectsModule } from '../projects/projects.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { R26ReadModelController } from './r26-read-model.controller';
import { R26ReadModelService } from './r26-read-model.service';

@Module({
  imports: [DashboardModule, ProjectsModule, WorkflowsModule],
  controllers: [R26ReadModelController],
  providers: [R26ReadModelService],
})
export class R26ReadModelModule {}
