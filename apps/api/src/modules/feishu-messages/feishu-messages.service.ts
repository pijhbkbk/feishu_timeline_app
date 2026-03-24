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
    this.logger.log(
      `[mock] send feishu message to ${input.userId}: ${input.title} (${input.dedupeKey})`,
    );

    return {
      success: true,
      messageId: `mock-${input.dedupeKey}`,
    };
  }
}

