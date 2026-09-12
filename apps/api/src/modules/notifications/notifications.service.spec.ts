import {
  AuditTargetType,
  NotificationSendChannel,
  NotificationSendStatus,
  NotificationType,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import {
  NOTIFICATION_LINK_PATH_INVALID,
  NotificationLinkPathValidationError,
  normalizeNotificationLinkPathForWrite,
  parseNotificationLinkPath,
  sanitizeNotificationLinkPathForRead,
} from './notification-link-path.rules';
import { NotificationsService } from './notifications.service';

const actor: AuthenticatedUser = {
  id: 'user-1',
  username: 'reviewer',
  name: '评审人',
  email: null,
  departmentId: null,
  departmentName: null,
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['reviewer'],
};

const normalizedLengthExpansionRawPath = `/a${' '.repeat(683)}b`;

function createService() {
  const prisma = {
    notification: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
    },
    workflowTask: {
      findUnique: vi.fn(),
    },
  };

  const activityLogsService = {
    create: vi.fn().mockResolvedValue(undefined),
  };

  const feishuMessagesService = {
    sendNotification: vi.fn().mockResolvedValue({
      success: true,
      messageId: 'mock-1',
    }),
  };

  const service = new NotificationsService(
    prisma as never,
    activityLogsService as never,
    feishuMessagesService as never,
  );

  return {
    service,
    prisma,
    activityLogsService,
    feishuMessagesService,
  };
}

describe('notification link path rules', () => {
  it.each([
    ['null', null, null],
    ['one-character root', '/', '/'],
    ['nested path', '/projects/project-1/workflow', '/projects/project-1/workflow'],
    ['internal query', '/projects/project-1?tab=todo', '/projects/project-1?tab=todo'],
    ['internal fragment', '/projects/project-1#item', '/projects/project-1#item'],
    [
      'query and fragment',
      '/projects/project-1/workflow?tab=todo#item',
      '/projects/project-1/workflow?tab=todo#item',
    ],
    ['exact maximum length', `/${'a'.repeat(2047)}`, `/${'a'.repeat(2047)}`],
    ['URL pathname normalization', '/projects/project 1', '/projects/project%201'],
    ['safe parent dot-segment normalization', '/a/../b', '/b'],
    ['safe current dot-segment normalization', '/a/./b', '/a/b'],
  ] as const)('admits and normalizes %s', (_label, input, normalized) => {
    expect(parseNotificationLinkPath(input)).toEqual({
      ok: true,
      original: input,
      normalized,
    });
    expect(normalizeNotificationLinkPathForWrite(input)).toBe(normalized);
    expect(sanitizeNotificationLinkPathForRead(input)).toBe(input);
  });

  it('rejects a raw-in-bound path whose WHATWG serialization exceeds the normalized bound', () => {
    const raw = normalizedLengthExpansionRawPath;
    const serialized = new URL(raw, 'https://notification.invalid').pathname;
    let normalizedResult: string | null | undefined;
    let error: unknown;

    expect(raw.length).toBeLessThanOrEqual(2048);
    expect(serialized.length).toBeGreaterThan(2048);
    expect(parseNotificationLinkPath(raw)).toEqual({
      ok: false,
      code: NOTIFICATION_LINK_PATH_INVALID,
    });

    try {
      normalizedResult = normalizeNotificationLinkPathForWrite(raw);
    } catch (caught) {
      error = caught;
    }

    expect(normalizedResult).toBeUndefined();
    expect(normalizedResult).not.toBe(serialized);
    expect(error).toBeInstanceOf(NotificationLinkPathValidationError);
    expect(error).toMatchObject({ code: NOTIFICATION_LINK_PATH_INVALID });
    expect(String((error as Error).message)).not.toContain(raw);
    expect(String((error as Error).message)).not.toContain(serialized);
    expect(sanitizeNotificationLinkPathForRead(raw)).toBeNull();
  });

  it.each([
    ['plain dot segment', '/a/..//normalized-closure-marker.example/path'],
    ['encoded dot segment', '/a/%2e%2e//normalized-closure-marker.example/path'],
  ] as const)(
    'NORMALIZED_OUTPUT_NOT_READMITTED: rejects %s that derives a protocol-relative path',
    (_label, input) => {
      expect(parseNotificationLinkPath(input)).toEqual({
        ok: false,
        code: NOTIFICATION_LINK_PATH_INVALID,
      });

      let error: unknown;
      try {
        normalizeNotificationLinkPathForWrite(input);
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(NotificationLinkPathValidationError);
      expect(error).toMatchObject({ code: NOTIFICATION_LINK_PATH_INVALID });
      expect(String((error as Error).message)).not.toContain('normalized-closure-marker');
    },
  );

  it('returns null when read sanitization receives a path that derives a protocol-relative path', () => {
    expect(
      sanitizeNotificationLinkPathForRead('/a/..//normalized-read-marker.example/path'),
    ).toBeNull();
  });

  it.each([
    ['undefined', undefined],
    ['number', 1],
    ['boolean', false],
    ['object', {}],
    ['array', []],
    ['empty', ''],
    ['2049 code units', `/${'a'.repeat(2048)}`],
    ['leading whitespace', ' /projects/project-1'],
    ['trailing whitespace', '/projects/project-1 '],
    ['C0 control', '/projects/\u0000project-1'],
    ['DEL control', '/projects/\u007fproject-1'],
    ['backslash', '/projects\\project-1'],
    ['protocol-relative sentinel override', '//notification-link.invalid/path'],
    ['backslash sentinel override', '/\\notification-link.invalid/path'],
    ['absolute HTTP', 'http://external.example/path'],
    ['absolute HTTPS', 'https://external.example/path'],
    ['absolute sentinel origin', 'https://notification-link.invalid/path'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/plain,unsafe'],
    ['file scheme', 'file:///tmp/unsafe'],
    ['mailto scheme', 'mailto:unsafe@example.invalid'],
    ['relative path', 'projects/project-1'],
  ] as const)('rejects %s with one stable non-sensitive result', (_label, input) => {
    expect(parseNotificationLinkPath(input)).toEqual({
      ok: false,
      code: NOTIFICATION_LINK_PATH_INVALID,
    });
    expect(sanitizeNotificationLinkPathForRead(input)).toBeNull();
  });

  it('throws only the stable write error without reflecting the rejected value', () => {
    const rejected = 'https://unique-rule-marker.example/path';

    let error: unknown;
    try {
      normalizeNotificationLinkPathForWrite(rejected);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(NotificationLinkPathValidationError);
    expect(error).toMatchObject({ code: NOTIFICATION_LINK_PATH_INVALID });
    expect(String((error as Error).message)).not.toContain('unique-rule-marker');
  });
});

describe('NotificationsService', () => {
  const systemJob = (linkPath: string | null) => ({
    id: 'job-system-1',
    type: NotificationType.SYSTEM_INFO,
    taskId: null,
    projectId: 'project-1',
    userId: 'user-1',
    title: '系统提醒',
    content: '请查看系统消息。',
    linkPath,
    triggeredByUserId: null,
    retryCount: 0,
    availableAt: new Date(0).toISOString(),
  });

  it.each([
    'https://direct-marker.example/path',
    '//direct-marker.example/path',
    '/a/..//direct-marker.example/path',
  ])('rejects an unsafe direct queued link before every side effect: %s', async (linkPath) => {
    const { service, prisma, activityLogsService, feishuMessagesService } = createService();

    const error = await service.processQueuedNotification(systemJob(linkPath)).catch(
      (caught: unknown) => caught,
    );

    expect(error).toMatchObject({ code: 'NOTIFICATION_LINK_PATH_INVALID' });
    expect(String((error as Error).message)).not.toContain('direct-marker');
    expect(prisma.notification.upsert).not.toHaveBeenCalled();
    expect(prisma.notification.findUnique).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(prisma.notification.update).not.toHaveBeenCalled();
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
    expect(activityLogsService.create).not.toHaveBeenCalled();
    expect(feishuMessagesService.sendNotification).not.toHaveBeenCalled();
  });

  it('rejects a raw-in-bound normalized-over-limit direct job before every side effect', async () => {
    const raw = normalizedLengthExpansionRawPath;
    const serialized = new URL(raw, 'https://notification.invalid').pathname;
    const { service, prisma, activityLogsService, feishuMessagesService } = createService();

    expect(raw.length).toBeLessThanOrEqual(2048);
    expect(serialized.length).toBeGreaterThan(2048);

    const error = await service
      .processQueuedNotification(systemJob(raw))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NotificationLinkPathValidationError);
    expect(error).toMatchObject({ code: NOTIFICATION_LINK_PATH_INVALID });
    expect(String((error as Error).message)).not.toContain(raw);
    expect(String((error as Error).message)).not.toContain(serialized);
    expect(prisma.notification.upsert).not.toHaveBeenCalled();
    expect(prisma.notification.findUnique).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(prisma.notification.update).not.toHaveBeenCalled();
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
    expect(activityLogsService.create).not.toHaveBeenCalled();
    expect(feishuMessagesService.sendNotification).not.toHaveBeenCalled();
  });

  it('runtime-checks a non-string direct queued link before every side effect', async () => {
    const { service, prisma, activityLogsService, feishuMessagesService } = createService();
    const job = { ...systemJob(null), linkPath: 42 };

    const error = await service.processQueuedNotification(job as never).catch(
      (caught: unknown) => caught,
    );

    expect(error).toMatchObject({ code: NOTIFICATION_LINK_PATH_INVALID });
    expect(prisma.notification.upsert).not.toHaveBeenCalled();
    expect(prisma.notification.findUnique).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(prisma.notification.update).not.toHaveBeenCalled();
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
    expect(activityLogsService.create).not.toHaveBeenCalled();
    expect(feishuMessagesService.sendNotification).not.toHaveBeenCalled();
  });

  it.each(['/projects/project-1/workflow?tab=todo#item', null])(
    'preserves an admitted direct queued link across persistence: %s',
    async (linkPath) => {
      const { service, prisma, feishuMessagesService } = createService();
      prisma.notification.upsert.mockResolvedValue(undefined);
      prisma.notification.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 'notification-feishu-1' });
      prisma.notification.update.mockResolvedValue(undefined);

      await expect(service.processQueuedNotification(systemJob(linkPath))).resolves.toEqual({
        skipped: false,
      });

      expect(prisma.notification.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ linkPath }),
          update: expect.objectContaining({ linkPath }),
        }),
      );
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(feishuMessagesService.sendNotification).not.toHaveBeenCalled();
    },
  );

  it('degrades unsafe persisted links to null without changing pagination or writing back', async () => {
    const { service, prisma } = createService();
    prisma.notification.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    const persistedLinks = [
      'https://persisted-marker.example/path',
      '//persisted-marker.example/path',
      '/projects/project-1/workflow?tab=todo#item',
    ];
    prisma.notification.findMany.mockResolvedValue(
      persistedLinks.map((linkPath, index) => ({
        id: `notification-${index + 1}`,
        projectId: 'project-1',
        taskId: null,
        notificationType: NotificationType.SYSTEM_INFO,
        title: `通知 ${index + 1}`,
        content: '内容仍然可见',
        linkPath,
        isRead: index === 2,
        readAt: null,
        sendStatus: NotificationSendStatus.SENT,
        createdAt: new Date(`2026-03-1${index + 7}T12:00:00.000Z`),
      })),
    );

    const result = await service.getMyNotifications({ page: '1', pageSize: '20' }, actor);

    expect(result).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 3,
      totalPages: 1,
      unreadCount: 2,
    });
    expect(result.items.map((item) => item.linkPath)).toEqual([
      null,
      null,
      '/projects/project-1/workflow?tab=todo#item',
    ]);
    expect(result.items.map((item) => item.content)).toEqual([
      '内容仍然可见',
      '内容仍然可见',
      '内容仍然可见',
    ]);
    expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.notification.update).not.toHaveBeenCalled();
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
    expect(prisma.notification.upsert).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('rejects a deep notification page before issuing count or row queries', async () => {
    const { service, prisma } = createService();

    await expect(
      service.getMyNotifications({ page: '10000000', pageSize: '100' }, actor),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PAGINATION_PAGE_OUT_OF_RANGE',
      }),
    });
    expect(prisma.notification.count).not.toHaveBeenCalled();
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });

  it('returns notifications scoped to current user', async () => {
    const { service, prisma } = createService();
    prisma.notification.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    prisma.notification.findMany.mockResolvedValue([
      {
        id: 'notification-1',
        projectId: 'project-1',
        taskId: 'task-1',
        notificationType: NotificationType.TASK_ASSIGNED,
        title: '新任务',
        content: '请处理',
        linkPath: '/projects/project-1/workflow',
        isRead: false,
        readAt: null,
        sendStatus: NotificationSendStatus.SENT,
        createdAt: new Date('2026-03-19T12:00:00.000Z'),
      },
    ]);

    const result = await service.getMyNotifications({}, actor);

    expect(result.items).toHaveLength(1);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          sendChannel: NotificationSendChannel.IN_APP,
        },
      }),
    );
  });

  it('marks notification as read and writes audit log', async () => {
    const { service, prisma, activityLogsService } = createService();
    prisma.notification.findFirst.mockResolvedValue({
      id: 'notification-1',
      projectId: 'project-1',
      notificationType: NotificationType.TASK_ASSIGNED,
      title: '新任务',
      isRead: false,
    });
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    prisma.notification.count.mockResolvedValue(0);

    await service.markRead('notification-1', actor);

    expect(prisma.notification.updateMany).toHaveBeenCalled();
    expect(activityLogsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: AuditTargetType.NOTIFICATION,
        action: 'NOTIFICATION_MARKED_READ',
      }),
    );
  });

  it('claims a single unread notification atomically and audits only the winning request', async () => {
    const { service, prisma, activityLogsService } = createService();
    prisma.notification.findFirst.mockResolvedValue({
      id: 'notification-1',
      projectId: 'project-1',
      notificationType: NotificationType.TASK_ASSIGNED,
      title: '新任务',
      isRead: false,
    });
    prisma.notification.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.notification.count.mockResolvedValue(0);

    await Promise.all([
      service.markRead('notification-1', actor),
      service.markRead('notification-1', actor),
    ]);

    expect(prisma.notification.update).not.toHaveBeenCalled();
    expect(prisma.notification.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'notification-1',
        userId: actor.id,
        sendChannel: NotificationSendChannel.IN_APP,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: expect.any(Date),
      },
    });
    expect(activityLogsService.create).toHaveBeenCalledTimes(1);
  });

  it('marks all unread notifications with constant-size query and audit metadata', async () => {
    const { service, prisma, activityLogsService } = createService();
    prisma.notification.findMany.mockResolvedValue(
      Array.from({ length: 10_000 }, (_, index) => ({
        id: `notification-${index}`,
        projectId: `project-${index}`,
      })),
    );
    prisma.notification.updateMany.mockResolvedValue({ count: 10_000 });
    prisma.notification.count.mockResolvedValue(0);

    await service.markAllRead(actor);

    expect(prisma.notification.findMany).not.toHaveBeenCalled();
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        userId: actor.id,
        sendChannel: NotificationSendChannel.IN_APP,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: expect.any(Date),
      },
    });
    expect(activityLogsService.create).toHaveBeenCalledWith({
      projectId: null,
      actorUserId: actor.id,
      targetType: AuditTargetType.NOTIFICATION,
      targetId: actor.id,
      action: 'NOTIFICATIONS_MARKED_ALL_READ',
      summary: '批量已读 10000 条通知',
      metadata: {
        count: 10_000,
      },
    });
  });

  it('creates notifications successfully for queued task jobs', async () => {
    const { service, prisma, feishuMessagesService } = createService();
    prisma.workflowTask.findUnique.mockResolvedValue({
      id: 'task-1',
      taskNo: 'TASK-001',
      taskRound: 1,
      nodeCode: 'CAB_REVIEW',
      nodeName: '样车驾驶室评审',
      projectId: 'project-1',
      assigneeUserId: 'user-2',
      project: {
        id: 'project-1',
        name: '项目A',
      },
      assigneeUser: {
        id: 'user-2',
        name: '张工',
      },
    });
    prisma.notification.upsert.mockResolvedValue(undefined);
    prisma.notification.findUnique.mockResolvedValue(null);
    prisma.notification.create.mockResolvedValue({
      id: 'notification-feishu-1',
    });
    prisma.notification.update.mockResolvedValue(undefined);

    await service.processQueuedNotification({
      id: 'job-1',
      type: NotificationType.REVIEW_PENDING,
      taskId: 'task-1',
      projectId: null,
      userId: null,
      title: null,
      content: null,
      linkPath: null,
      triggeredByUserId: null,
      retryCount: 0,
      availableAt: new Date().toISOString(),
    });

    expect(prisma.notification.upsert).toHaveBeenCalled();
    expect(feishuMessagesService.sendNotification).not.toHaveBeenCalled();
  });
});
