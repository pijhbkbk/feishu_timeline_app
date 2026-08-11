import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FeishuMessagesService } from './feishu-messages.service';

describe('FeishuMessagesService production log safety', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs only allowlisted delivery metadata and excludes business or credential values', async () => {
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const service = new FeishuMessagesService();
    const sensitiveValues = {
      userId: 'ou_sensitive_user_2026',
      title: 'CONFIDENTIAL_PROJECT_TITLE',
      taskId: 'task-sensitive-2026',
      dedupeKey: 'TASK_ASSIGNED:ou_sensitive_user_2026:task-sensitive-2026:1',
      token: 'Bearer secret-token-like-value',
    };

    await service.sendNotification({
      userId: sensitiveValues.userId,
      title: sensitiveValues.title,
      content: `${sensitiveValues.taskId} ${sensitiveValues.token}`,
      dedupeKey: sensitiveValues.dedupeKey,
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const serializedLogs = JSON.stringify(logSpy.mock.calls);

    for (const sensitiveValue of Object.values(sensitiveValues)) {
      expect(serializedLogs).not.toContain(sensitiveValue);
    }
    expect(serializedLogs).toContain('feishu_notification');
    expect(serializedLogs).toContain('mock_sent');
  });
});
