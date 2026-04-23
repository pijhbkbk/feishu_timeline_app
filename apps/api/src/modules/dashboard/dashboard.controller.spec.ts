import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { PERMISSION_METADATA_KEY } from '../auth/auth.constants';
import { DashboardController } from './dashboard.controller';

describe('DashboardController metadata', () => {
  it('protects report endpoints with dashboard.read', () => {
    const prototype = DashboardController.prototype;

    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.getOverview)).toEqual([
      'dashboard.read',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.getStageDistribution)).toEqual([
      'dashboard.read',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.getRecentReviews)).toEqual([
      'dashboard.read',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.getRiskProjects)).toEqual([
      'dashboard.read',
    ]);
  });
});
