import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ActivityLogsService } from '../../src/modules/activity-logs/activity-logs.service';
import { AttachmentsService } from '../../src/modules/attachments/attachments.service';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types';
import { ColorExitsService } from '../../src/modules/color-exits/color-exits.service';
import { ReviewsService } from '../../src/modules/reviews/reviews.service';
import { WorkflowsService } from '../../src/modules/workflows/workflows.service';

const actor: AuthenticatedUser = {
  id: 'manager-1',
  username: 'manager-1',
  name: '项目经理',
  email: null,
  departmentId: 'dept-1',
  departmentName: '项目管理部',
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['project_manager'],
  permissionCodes: ['project.read', 'audit.read'],
};

describe('R24 enumerable identifier and IDOR boundaries', () => {
  it('binds attachmentId and reviewId lookups to the requested projectId', async () => {
    const attachmentFindFirst = vi.fn().mockResolvedValue(null);
    const attachments = new AttachmentsService(
      {} as never,
      { get: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      (attachments as any).getAttachmentOrThrow(
        { attachment: { findFirst: attachmentFindFirst } },
        'project-a',
        'attachment-from-project-b',
        false,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(attachmentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'attachment-from-project-b',
          projectId: 'project-a',
        }),
      }),
    );

    const reviewFindFirst = vi.fn().mockResolvedValue(null);
    const reviews = new ReviewsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      (reviews as any).getCabinReviewOrThrow(
        { reviewRecord: { findFirst: reviewFindFirst } },
        'project-a',
        'review-from-project-b',
        actor,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(reviewFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'review-from-project-b',
          projectId: 'project-a',
        }),
      }),
    );
  });

  it('binds recurringTaskId and colorExitId lookups to projectId', async () => {
    const recurringFindFirst = vi.fn().mockResolvedValue(null);
    const projectAccess = {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(undefined),
    };
    const workflows = new WorkflowsService(
      { recurringTask: { findFirst: recurringFindFirst } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      projectAccess as never,
    );

    await expect(
      workflows.getMonthlyReviewTaskDetail(
        'project-a',
        'recurring-from-project-b',
        actor,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(recurringFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'recurring-from-project-b',
          projectId: 'project-a',
        },
      }),
    );

    const exitFindFirst = vi.fn().mockResolvedValue(null);
    const colorExits = new ColorExitsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      (colorExits as any).getExitRecordOrThrow(
        { colorExit: { findFirst: exitFindFirst } },
        'project-a',
        'exit-from-project-b',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(exitFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'exit-from-project-b',
          projectId: 'project-a',
        },
      }),
    );
  });

  it('authorizes taskId against the task owning project instead of a caller-controlled scope', async () => {
    const task = {
      id: 'task-from-project-b',
      projectId: 'project-b',
    };
    const taskFindUnique = vi.fn().mockResolvedValue(task);
    const projectAccess = {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(undefined),
    };
    const workflows = new WorkflowsService(
      { workflowTask: { findUnique: taskFindUnique } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      projectAccess as never,
    );
    vi.spyOn(workflows as any, 'buildTaskDetailResponse').mockResolvedValue({ id: task.id });

    await workflows.getTaskDetail(task.id, actor);

    expect(projectAccess.assertProjectAccessWithDefaultClient).toHaveBeenCalledWith(
      'project-b',
      actor,
      'project.read',
    );
  });

  it('binds auditLogId to projectId before returning log detail', async () => {
    const auditFindFirst = vi.fn().mockResolvedValue(null);
    const projectAccess = {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(undefined),
    };
    const activityLogs = new ActivityLogsService(
      { auditLog: { findFirst: auditFindFirst } } as never,
      projectAccess as never,
    );

    await expect(
      activityLogs.getProjectLogDetail(
        'project-a',
        'audit:audit-from-project-b',
        actor,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(auditFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'audit-from-project-b',
          projectId: 'project-a',
        },
      }),
    );
  });
});
