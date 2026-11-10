import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { ROLE_METADATA_KEY, PUBLIC_ROUTE_KEY } from '../auth/auth.constants';
import { ReviewsController } from './reviews.controller';

describe('ReviewsController RBAC metadata', () => {
  it('keeps exterior correction within the existing authenticated review boundary', () => {
    const handler = ReviewsController.prototype.completeExteriorRectification;
    expect(Reflect.getMetadata(PUBLIC_ROUTE_KEY, handler)).toBeUndefined();
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, handler)).toEqual(Reflect.getMetadata(ROLE_METADATA_KEY, ReviewsController.prototype.rejectConsistencyReview));
  });
  it('protects cabin review endpoints with reviewer roles', () => {
    const prototype = ReviewsController.prototype;

    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.getCabinReviewWorkspace)).toBeUndefined();
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.approveCabinReview)).toEqual([
      'admin',
      'project_manager',
      'quality_engineer',
      'reviewer',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.rejectCabinReview)).toEqual([
      'admin',
      'project_manager',
      'quality_engineer',
      'reviewer',
    ]);
    expect(
      Reflect.getMetadata(ROLE_METADATA_KEY, prototype.getConsistencyReviewWorkspace),
    ).toBeUndefined();
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.approveConsistencyReview)).toEqual([
      'admin',
      'project_manager',
      'quality_engineer',
      'reviewer',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.rejectConsistencyReview)).toEqual([
      'admin',
      'project_manager',
      'quality_engineer',
      'reviewer',
    ]);
    expect(
      Reflect.getMetadata(ROLE_METADATA_KEY, prototype.getVisualDeltaReviewWorkspace),
    ).toBeUndefined();
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.approveVisualDeltaReview)).toEqual([
      'admin',
      'project_manager',
      'quality_engineer',
      'reviewer',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.rejectVisualDeltaReview)).toEqual([
      'admin',
      'project_manager',
      'quality_engineer',
      'reviewer',
    ]);
    for (const method of [prototype.previewVisualDeltaStage, prototype.confirmVisualDeltaStage]) {
      expect(Reflect.getMetadata(ROLE_METADATA_KEY, method)).toEqual([
        'admin', 'project_manager', 'quality_engineer', 'reviewer',
      ]);
    }
  });
});
