import { describe, expect, it } from 'vitest';

import { PERMISSION_METADATA_KEY } from '../auth/auth.constants';
import { TasksController } from './tasks.controller';

describe('TasksController', () => {
  it('protects task detail with project.read', () => {
    const prototype = TasksController.prototype;

    expect(
      Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.getTaskDetail),
    ).toEqual(['project.read']);
  });
});
