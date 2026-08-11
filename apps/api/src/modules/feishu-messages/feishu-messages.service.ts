import { Injectable, Logger } from '@nestjs/common';

type FeishuMessageInput = {
  userId: string;
  title: string;
  content: string;
  dedupeKey: string;
};

@Injectable()
export class FeishuMessagesService {
  private readonly logger = new Logger(FeishuMessagesService.name);

  async sendNotification(input: FeishuMessageInput) {
    this.logger.log('eventType=feishu_notification result=mock_sent');

    return {
      success: true,
      messageId: `mock-${input.dedupeKey}`,
    };
  }
}
