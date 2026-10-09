import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ColorRegisterController } from './color-register.controller';
import { ColorRegisterService } from './color-register.service';
@Module({ imports: [AuthModule], controllers: [ColorRegisterController], providers: [ColorRegisterService], exports: [ColorRegisterService] })
export class ColorRegisterModule {}
