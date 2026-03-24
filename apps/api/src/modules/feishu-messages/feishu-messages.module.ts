import { Module } from '@nestjs/common';

import { FeishuMessagesService } from './feishu-messages.service';

@Module({
  providers: [FeishuMessagesService],
  exports: [FeishuMessagesService],
})
export class FeishuMessagesModule {}

