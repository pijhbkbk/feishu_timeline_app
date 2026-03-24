import { Module } from '@nestjs/common';

import { FEISHU_AUTH_ADAPTER } from './feishu.constants';
import { StubFeishuAuthAdapter } from './feishu-auth.adapter';

@Module({
  providers: [
    StubFeishuAuthAdapter,
    {
      provide: FEISHU_AUTH_ADAPTER,
      useExisting: StubFeishuAuthAdapter,
    },
  ],
  exports: [FEISHU_AUTH_ADAPTER],
})
export class FeishuModule {}
