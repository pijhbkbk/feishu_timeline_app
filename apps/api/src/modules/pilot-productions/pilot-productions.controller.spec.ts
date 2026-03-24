import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { ROLE_METADATA_KEY } from '../auth/auth.constants';
import { PilotProductionsController } from './pilot-productions.controller';

describe('PilotProductionsController RBAC metadata', () => {
  it('protects read and write endpoints with expected roles', () => {
    const prototype = PilotProductionsController.prototype;

    expect(
      Reflect.getMetadata(ROLE_METADATA_KEY, prototype.getFirstProductionPlanWorkspace),
    ).toEqual(['admin', 'project_manager', 'process_engineer', 'quality_engineer']);
    expect(
      Reflect.getMetadata(ROLE_METADATA_KEY, prototype.createFirstProductionPlan),
    ).toEqual(['admin', 'project_manager', 'process_engineer']);
    expect(
      Reflect.getMetadata(ROLE_METADATA_KEY, prototype.completeTrialProductionTask),
    ).toEqual(['admin', 'project_manager', 'process_engineer']);
  });
});
