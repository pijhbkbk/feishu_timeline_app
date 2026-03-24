import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { ROLE_METADATA_KEY } from '../auth/auth.constants';
import { AttachmentsController } from './attachments.controller';

describe('AttachmentsController RBAC metadata', () => {
  it('protects write endpoints with attachment management roles', () => {
    const prototype = AttachmentsController.prototype;
    const expectedRoles = [
      'admin',
      'project_manager',
      'process_engineer',
      'quality_engineer',
      'purchaser',
      'reviewer',
      'finance',
    ];

    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.uploadAttachment)).toEqual(expectedRoles);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.bindAttachment)).toEqual(expectedRoles);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.unbindAttachment)).toEqual(expectedRoles);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.deleteAttachment)).toEqual(expectedRoles);
  });
});
