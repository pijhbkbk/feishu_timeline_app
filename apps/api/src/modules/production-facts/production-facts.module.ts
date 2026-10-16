import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProductionFactsController } from './production-facts.controller';
import { ProductionFactsService } from './production-facts.service';
@Module({ imports: [AuthModule], controllers: [ProductionFactsController], providers: [ProductionFactsService], exports: [ProductionFactsService] })
export class ProductionFactsModule {}
