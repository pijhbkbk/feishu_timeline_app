import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { SheetImagesController } from './sheet-images.controller';
import { SheetImagesService } from './sheet-images.service';
import { SheetThumbnailAdmissionService, SheetThumbnailAdmissionInterceptor } from './sheet-thumbnail-admission';

@Module({ imports: [AuthModule, AttachmentsModule], controllers: [SheetImagesController], providers: [SheetImagesService, SheetThumbnailAdmissionService, SheetThumbnailAdmissionInterceptor] })
export class SheetImagesModule {}
