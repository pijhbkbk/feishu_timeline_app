import { ColorAnnualReviewService } from './color-annual-review.service';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ColorRegisterController } from './color-register.controller';
import { ColorRegisterService } from './color-register.service';
@Module({ imports: [AuthModule], controllers: [ColorRegisterController], providers: [ColorRegisterService, ColorAnnualReviewService], exports: [ColorRegisterService] })
export class ColorRegisterModule {}
