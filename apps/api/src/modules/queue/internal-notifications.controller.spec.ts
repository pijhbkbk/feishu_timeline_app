import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { ROLE_METADATA_KEY } from '../auth/auth.constants';
import { InternalNotificationsController } from './internal-notifications.controller';

describe('InternalNotificationsController RBAC metadata', () => {
  it('protects internal notification endpoints with admin role', () => {
    const prototype = InternalNotificationsController.prototype;

    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.enqueue)).toEqual(['admin']);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.processOverdueScan)).toEqual([
      'admin',
    ]);
  });
});

