import 'reflect-metadata';

import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AttachmentsController } from '../../src/modules/attachments/attachments.controller';
import { ColorExitsController } from '../../src/modules/color-exits/color-exits.controller';
import { FeesController } from '../../src/modules/fees/fees.controller';
import { PERMISSION_METADATA_KEY, ROLE_METADATA_KEY } from '../../src/modules/auth/auth.constants';
import { ProjectAccessService } from '../../src/modules/auth/project-access.service';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types';

const scopedActor: AuthenticatedUser = {
  id: 'user-a',
  username: 'user-a',
  name: '用户 A',
  email: null,
  departmentId: 'dept-a',
  departmentName: '部门 A',
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['project_manager'],
  permissionCodes: ['project.read'],
};

describe('R19 permission and IDOR security', () => {
  it('rejects project access when projectId is enumerated outside the actor scope', async () => {
    const prisma = {
      project: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'project-b',
          ownerUserId: 'owner-b',
          owningDepartmentId: 'dept-b',
          members: [],
        }),
      },
    };
    const service = new ProjectAccessService(prisma as never);

    await expect(
      service.assertProjectAccessWithDefaultClient('project-b', scopedActor, 'project.read'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps fee operations restricted to admin, project manager and finance roles', () => {
    const prototype = FeesController.prototype;
    const expectedRoles = ['admin', 'project_manager', 'finance'];

    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.createFee)).toEqual(expectedRoles);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.updateFee)).toEqual(expectedRoles);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.markPaid)).toEqual(expectedRoles);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.completeTask)).toEqual(expectedRoles);
  });

  it('keeps color exit finalization behind workflow permissions and owner roles', () => {
    const prototype = ColorExitsController.prototype;
    const expectedRoles = ['admin', 'project_manager', 'process_engineer'];

    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.createExitRecord)).toEqual([
      'workflow.transition',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.createExitRecord)).toEqual(expectedRoles);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.updateExitRecord)).toEqual(expectedRoles);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.completeExitRecord)).toEqual(expectedRoles);
  });

  it('requires attachment.manage permission for upload and mutation endpoints', () => {
    const prototype = AttachmentsController.prototype;

    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.uploadAttachment)).toEqual([
      'attachment.manage',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.bindAttachment)).toEqual([
      'attachment.manage',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.deleteAttachment)).toEqual([
      'attachment.manage',
    ]);
  });
});
