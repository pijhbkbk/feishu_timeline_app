import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InspectionsController } from './inspections.controller';
import { InspectionsService } from './inspections.service';
import { VisualLedgerController } from './visual-ledger.controller';
import { VisualLedgerService } from './visual-ledger.service';
@Module({imports:[AuthModule],controllers:[InspectionsController,VisualLedgerController],providers:[InspectionsService,VisualLedgerService],exports:[InspectionsService]})
export class InspectionsModule {}
