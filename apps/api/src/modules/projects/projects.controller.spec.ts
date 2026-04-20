import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { PERMISSION_METADATA_KEY, ROLE_METADATA_KEY } from '../auth/auth.constants';
import { ProjectsController } from './projects.controller';

describe('ProjectsController metadata', () => {
  it('protects read endpoints with project.read', () => {
    const prototype = ProjectsController.prototype;

    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.listProjects)).toEqual([
      'project.read',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.getProjectDetail)).toEqual([
      'project.read',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.getProjectStageOverview)).toEqual([
      'project.read',
    ]);
  });

  it('protects write endpoints with project.write and PM roles', () => {
    const prototype = ProjectsController.prototype;

    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.createProject)).toEqual([
      'project.write',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.updateProject)).toEqual([
      'project.write',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.replaceProjectMembers)).toEqual([
      'project.write',
    ]);

    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.createProject)).toEqual([
      'admin',
      'project_manager',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.updateProject)).toEqual([
      'admin',
      'project_manager',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.replaceProjectMembers)).toEqual([
      'admin',
      'project_manager',
    ]);
  });
});
