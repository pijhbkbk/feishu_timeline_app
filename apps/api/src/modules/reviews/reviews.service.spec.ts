import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { ReviewsService } from './reviews.service';

function createActor(
  id: string,
  roleCodes: AuthenticatedUser['roleCodes'],
): AuthenticatedUser {
  return {
    id,
    username: id,
    name: id,
    email: null,
    departmentId: 'dept-1',
    departmentName: '部门',
    isSystemAdmin: roleCodes.includes('admin'),
    authSource: 'mock',
    roleCodes,
    permissionCodes: ['project.read', 'review.execute'],
  };
}

function createService() {
  return new ReviewsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe('ReviewsService plan A authorization', () => {
  it('allows only the designated reviewer or project manager to operate a review record', () => {
    const service = createService();
    const designatedReviewer = createActor('reviewer-1', ['reviewer']);
    const otherReviewer = createActor('reviewer-2', ['reviewer']);
    const projectManager = createActor('manager-1', ['project_manager']);
    const administrator = createActor('admin-1', ['admin']);

    expect(() =>
      (service as any).assertActorCanManageReviewRecord(
        designatedReviewer,
        'reviewer-1',
      ),
    ).not.toThrow();
    expect(() =>
      (service as any).assertActorCanManageReviewRecord(projectManager, 'reviewer-1'),
    ).not.toThrow();
    expect(() =>
      (service as any).assertActorCanManageReviewRecord(otherReviewer, 'reviewer-1'),
    ).toThrow(ForbiddenException);
    expect(() =>
      (service as any).assertActorCanManageReviewRecord(administrator, 'reviewer-1'),
    ).toThrow(ForbiddenException);
  });

  it('prevents a reviewer from assigning a record to another user', () => {
    const service = createService();
    const reviewer = createActor('reviewer-1', ['reviewer']);
    const projectManager = createActor('manager-1', ['project_manager']);

    expect(() =>
      (service as any).assertActorCanAssignReviewer(reviewer, 'reviewer-1'),
    ).not.toThrow();
    expect(() =>
      (service as any).assertActorCanAssignReviewer(reviewer, 'reviewer-2'),
    ).toThrow(ForbiddenException);
    expect(() =>
      (service as any).assertActorCanAssignReviewer(projectManager, 'reviewer-2'),
    ).not.toThrow();
  });
});
