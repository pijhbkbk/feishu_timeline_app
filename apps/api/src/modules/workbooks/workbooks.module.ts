import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkbooksController } from './workbooks.controller';
import { WorkbooksService } from './workbooks.service';
@Module({imports:[AuthModule],controllers:[WorkbooksController],providers:[WorkbooksService]})
export class WorkbooksModule {}
