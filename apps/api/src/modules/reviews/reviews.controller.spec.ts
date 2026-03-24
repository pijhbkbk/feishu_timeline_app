import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { ROLE_METADATA_KEY } from '../auth/auth.constants';
import { ReviewsController } from './reviews.controller';

describe('ReviewsController RBAC metadata', () => {
  it('protects cabin review endpoints with reviewer roles', () => {
    const prototype = ReviewsController.prototype;

    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.getCabinReviewWorkspace)).toEqual([
      'admin',
      'project_manager',
      'quality_engineer',
      'reviewer',
    ]);
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
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.getConsistencyReviewWorkspace)).toEqual([
      'admin',
      'project_manager',
      'quality_engineer',
      'reviewer',
    ]);
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
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.getVisualDeltaReviewWorkspace)).toEqual([
      'admin',
      'project_manager',
      'quality_engineer',
      'reviewer',
    ]);
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
  });
});
