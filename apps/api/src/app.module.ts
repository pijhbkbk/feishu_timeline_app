import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import appConfig from './common/app-config';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RedisModule } from './infra/redis/redis.module';
import { ActivityLogsModule } from './modules/activity-logs/activity-logs.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { AuthModule } from './modules/auth/auth.module';
import { ColorExitsModule } from './modules/color-exits/color-exits.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DictsModule } from './modules/dicts/dicts.module';
import { DevelopmentReportsModule } from './modules/development-reports/development-reports.module';
import { FeishuModule } from './modules/feishu/feishu.module';
import { FeishuMessagesModule } from './modules/feishu-messages/feishu-messages.module';
import { FeesModule } from './modules/fees/fees.module';
import { HealthModule } from './modules/health/health.module';
import { MassProductionsModule } from './modules/mass-productions/mass-productions.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrgsModule } from './modules/orgs/orgs.module';
import { PaintProcurementsModule } from './modules/paint-procurements/paint-procurements.module';
import { PerformanceTestsModule } from './modules/performance-tests/performance-tests.module';
import { PilotProductionsModule } from './modules/pilot-productions/pilot-productions.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ProductionPlansModule } from './modules/production-plans/production-plans.module';
import { QueueModule } from './modules/queue/queue.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { SamplesModule } from './modules/samples/samples.module';
import { StandardBoardsModule } from './modules/standard-boards/standard-boards.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { TodosModule } from './modules/todos/todos.module';
import { UsersModule } from './modules/users/users.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: ['.env.local', '.env', '.env.example'],
    }),
    PrismaModule,
    RedisModule,
    HealthModule,
    DashboardModule,
    AuthModule,
    FeishuModule,
    FeishuMessagesModule,
    ColorExitsModule,
    FeesModule,
    NotificationsModule,
    UsersModule,
    OrgsModule,
    ProjectsModule,
    ProductionPlansModule,
    MassProductionsModule,
    SamplesModule,
    SuppliersModule,
    PaintProcurementsModule,
    PerformanceTestsModule,
    PilotProductionsModule,
    StandardBoardsModule,
    WorkflowsModule,
    QueueModule,
    ReviewsModule,
    DevelopmentReportsModule,
    AttachmentsModule,
    ActivityLogsModule,
    TasksModule,
    TodosModule,
    DictsModule,
  ],
})
export class AppModule {}
